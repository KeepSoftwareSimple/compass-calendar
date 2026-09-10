import { backOff } from "exponential-backoff";
import {
  type ClientSession,
  type ClientSessionOptions,
  type Collection,
  type ConnectionClosedEvent,
  type Db,
  MongoClient,
  ObjectId,
} from "mongodb";
import { NodeEnv } from "@core/constants/core.constants";
import { Logger } from "@core/logger/winston.logger";
import { type Schema_User } from "@core/types/user.types";
import { isTransientMongoNetworkError } from "@core/util/mongo-network-error.util";
import { type BillingEventRecord } from "@backend/billing/billing-event.record";
import { type BookingPageRecord } from "@backend/booking/booking-page.record";
import { type BookingReservationRecord } from "@backend/booking/booking-reservation.record";
import { type CalendarRecord } from "@backend/calendar/calendar.record";
import { Collections } from "@backend/common/constants/collections";
import { CONFIG } from "@backend/common/constants/config.constants";
import { type EventRecord } from "@backend/event/event.record";
import { type HiddenEventRecord } from "@backend/user/hidden-event.record";
import { type PendingAccountDeletionRecord } from "@backend/user/pending-account-deletion.record";

const logger = Logger("app:mongo.service");

interface InternalClient {
  db: Db;
  client: MongoClient;
  billingEvent: Collection<BillingEventRecord>;
  bookingPage: Collection<BookingPageRecord>;
  bookingReservation: Collection<BookingReservationRecord>;
  calendar: Collection<CalendarRecord>;
  event: Collection<EventRecord>;
  hiddenEvent: Collection<HiddenEventRecord>;
  pendingAccountDeletion: Collection<PendingAccountDeletionRecord>;
  user: Collection<Schema_User>;
}

class MongoService {
  #internalClient?: InternalClient;

  get db() {
    return this.#internalClient!.db;
  }

  /**
   * calendar
   *
   * mongo collection
   */
  get calendar(): InternalClient["calendar"] {
    return this.#accessInternalCollectionProps("calendar");
  }

  /**
   * Stripe webhook dedupe. `_id` is the Stripe event id so no secondary
   * index is required.
   */
  get billingEvent(): InternalClient["billingEvent"] {
    return this.#accessInternalCollectionProps("billingEvent");
  }

  get bookingPage(): InternalClient["bookingPage"] {
    return this.#accessInternalCollectionProps("bookingPage");
  }

  get bookingReservation(): InternalClient["bookingReservation"] {
    return this.#accessInternalCollectionProps("bookingReservation");
  }

  get hiddenEvent(): InternalClient["hiddenEvent"] {
    return this.#accessInternalCollectionProps("hiddenEvent");
  }

  /**
   * event
   *
   * mongo collection
   */
  get event(): InternalClient["event"] {
    return this.#accessInternalCollectionProps("event");
  }

  get pendingAccountDeletion(): InternalClient["pendingAccountDeletion"] {
    return this.#accessInternalCollectionProps("pendingAccountDeletion");
  }

  /**
   * user
   *
   * mongo collection
   */
  get user(): InternalClient["user"] {
    return this.#accessInternalCollectionProps("user");
  }

  private onConnect(client: MongoClient, dbName?: string | null) {
    this.#internalClient = this.createInternalClient(client, dbName);
  }

  private onDisconnect(): void {
    logger.debug(`Disconnected from database: '${this.db.namespace}'`);
  }

  private onError(error: Error): void {
    // Client "error" events include brief Atlas/DNS blips; warn those so they
    // do not open PostHog exception alerts. Unexpected client errors still page.
    if (isTransientMongoNetworkError(error)) {
      logger.warn(error.message, error);
      return;
    }
    logger.error(error.message, error);
  }

  private onClose(event: ConnectionClosedEvent): void {
    logger.debug(`Connection to database: '${event.address}' closed`);
  }

  private createInternalClient(
    client: MongoClient,
    dbName?: string | null,
  ): InternalClient {
    const db =
      dbName === null ? client.db(undefined) : client.db(dbName ?? CONFIG.DB);

    return {
      db,
      client,
      billingEvent: db.collection<BillingEventRecord>(
        Collections.BILLING_EVENT,
      ),
      bookingPage: db.collection<BookingPageRecord>(Collections.BOOKING_PAGE),
      bookingReservation: db.collection<BookingReservationRecord>(
        Collections.BOOKING_RESERVATION,
      ),
      calendar: db.collection<CalendarRecord>(Collections.CALENDAR),
      event: db.collection<EventRecord>(Collections.EVENT),
      hiddenEvent: db.collection<HiddenEventRecord>(Collections.HIDDEN_EVENT),
      pendingAccountDeletion: db.collection<PendingAccountDeletionRecord>(
        Collections.PENDING_ACCOUNT_DELETION,
      ),
      user: db.collection<Schema_User>(Collections.USER),
    };
  }

  #accessInternalCollectionProps<K extends keyof InternalClient>(
    key: K,
  ): InternalClient[K] {
    if (!this.#internalClient) {
      throw new Error("did you forget to call `start`?");
    }

    return this.#internalClient[key];
  }

  private onRetryConnect(
    error: Error,
    attempts: number,
    timeout: number,
  ): boolean {
    const seconds = attempts * 5;
    const retry = seconds * 1000 < timeout;

    if (retry) {
      logger.warn(
        `MongoDB connection unsuccessful (will retry #${attempts} after ${seconds} seconds):`,
        error,
      );
    }

    return retry;
  }

  /**
   * @param dbName Explicit database name for tests. `null` uses the default
   * database from the connection URI (migrations). Omit for CONFIG.DB.
   */
  async start(dbName?: string | null): Promise<MongoService> {
    if (this.#internalClient) {
      const currentDb = this.#internalClient.db.databaseName;
      const nextDb =
        dbName === null ? undefined : dbName === undefined ? CONFIG.DB : dbName;

      if (currentDb === nextDb) return this;

      await this.stop();
    }

    const client = new MongoClient(CONFIG.MONGO_URI, {
      serverApi: { strict: true, version: "1" },
    });

    client.on("close", this.onDisconnect.bind(this));
    client.on("error", this.onError.bind(this));
    client.on("connectionClosed", this.onClose.bind(this));

    const connectedClient = await this.reconnect(client);
    this.onConnect(connectedClient, dbName);

    return this;
  }

  async reconnect(client: MongoClient): Promise<MongoClient> {
    // A local/in-memory test server is either up or it is not; the production
    // startup backoff (a full second before the first attempt, growing 5x)
    // only adds dead time per test file. Connect eagerly under test.
    const isTest = CONFIG.NODE_ENV === NodeEnv.Test;

    return backOff(client.connect.bind(client), {
      jitter: "full",
      delayFirstAttempt: !isTest,
      startingDelay: isTest ? 0 : 1000,
      timeMultiple: 5,
      retry: (...args) => this.onRetryConnect(...args, isTest ? 0 : 25000),
    });
  }

  async stop(): Promise<void> {
    if (!this.#internalClient) return;

    const client = this.#accessInternalCollectionProps("client");

    await client.close();

    client.removeAllListeners();

    this.#internalClient = undefined;
  }

  async startSession(options?: ClientSessionOptions): Promise<ClientSession> {
    return this.#internalClient!.client.startSession(options);
  }

  objectId(id?: string): ObjectId {
    return new ObjectId(id);
  }

  async recordExists(collection: string, filter: object): Promise<boolean> {
    const r = await this.db.collection(collection).findOne(filter);
    return r !== null;
  }

  async collectionExists(name: string): Promise<boolean> {
    return this.db.listCollections({ name }).hasNext();
  }
}

export default new MongoService();
