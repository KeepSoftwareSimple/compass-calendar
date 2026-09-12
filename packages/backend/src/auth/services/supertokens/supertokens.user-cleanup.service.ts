import {
  deleteUser,
  deleteUserIdMapping,
  getUser,
  getUserIdMapping,
  listUsersByAccountInfo,
} from "supertokens-node";
import SupertokensUserMetadata from "supertokens-node/recipe/usermetadata";
import { Logger } from "@core/logger/winston.logger";
import { normalizeEmail } from "@core/util/email.util";
import { initSupertokens } from "@backend/common/middleware/supertokens.middleware";
import { type Summary_Delete } from "@backend/user/types/user.types";

const logger = Logger("app:auth.supertokens-user-cleanup");
const TENANT_ID = "public";

type SupertokensCleanupTarget = {
  externalUserIds: string[];
  superTokensUserIds: string[];
};

type SupertokensCleanupSummary = {
  superTokensUsers: NonNullable<Summary_Delete["superTokensUsers"]>;
  superTokensMappings: NonNullable<Summary_Delete["superTokensMappings"]>;
  superTokensMetadata: NonNullable<Summary_Delete["superTokensMetadata"]>;
};

type UserMetadataResponse = {
  status: "OK";
  metadata: unknown;
};

class SupertokensUserCleanupService {
  private init() {
    initSupertokens();
  }

  private getUniqueValues(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }

  private hasMetadata(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private async getExternalUserIds(recipeUserIds: string[]): Promise<string[]> {
    const externalUserIds = await Promise.all(
      recipeUserIds.map(async (recipeUserId) => {
        const mapping = await getUserIdMapping({
          userId: recipeUserId,
          userIdType: "SUPERTOKENS",
        });

        return mapping.status === "OK" ? mapping.externalUserId : undefined;
      }),
    );

    return this.getUniqueValues(
      externalUserIds.filter(
        (value): value is string => typeof value === "string",
      ),
    );
  }

  async resolveByEmail(email: string): Promise<SupertokensCleanupTarget> {
    this.init();

    const users = await listUsersByAccountInfo(TENANT_ID, {
      email: normalizeEmail(email),
    });
    const superTokensUserIds = this.getUniqueValues(users.map(({ id }) => id));
    const recipeUserIds = this.getUniqueValues(
      users.flatMap((user) =>
        user.loginMethods.map((method) => method.recipeUserId.getAsString()),
      ),
    );
    const externalUserIds = await this.getExternalUserIds(recipeUserIds);

    return {
      externalUserIds,
      superTokensUserIds,
    };
  }

  async resolveByExternalUserId(
    externalUserId: string,
  ): Promise<SupertokensCleanupTarget> {
    this.init();

    const mapping = await getUserIdMapping({
      userId: externalUserId,
      userIdType: "EXTERNAL",
    });

    if (mapping.status !== "OK") {
      return {
        externalUserIds: [externalUserId],
        superTokensUserIds: [],
      };
    }

    const user = await getUser(mapping.superTokensUserId);
    if (!user) {
      return {
        externalUserIds: [externalUserId],
        superTokensUserIds: [],
      };
    }

    const recipeUserIds = user.loginMethods.map((method) =>
      method.recipeUserId.getAsString(),
    );
    const externalUserIds = await this.getExternalUserIds(recipeUserIds);

    return {
      externalUserIds: this.getUniqueValues([
        externalUserId,
        ...externalUserIds,
      ]),
      superTokensUserIds: this.getUniqueValues([user.id]),
    };
  }

  async cleanupResolvedTarget(
    target: SupertokensCleanupTarget,
  ): Promise<SupertokensCleanupSummary> {
    this.init();

    const summary: SupertokensCleanupSummary = {
      superTokensUsers: 0,
      superTokensMappings: 0,
      superTokensMetadata: 0,
    };
    const externalUserIds = this.getUniqueValues(target.externalUserIds);
    const superTokensUserIds = this.getUniqueValues(target.superTokensUserIds);
    const mappedExternalUserIds: string[] = [];

    for (const externalUserId of externalUserIds) {
      const metadata = (await SupertokensUserMetadata.getUserMetadata(
        externalUserId,
      )) as UserMetadataResponse;
      const storedMetadata = metadata.metadata;

      if (metadata.status === "OK" && this.hasMetadata(storedMetadata)) {
        const metadataKeys = Object.keys(storedMetadata);

        if (metadataKeys.length === 0) {
          continue;
        }

        await SupertokensUserMetadata.clearUserMetadata(externalUserId);
        summary.superTokensMetadata += 1;
      }

      const mapping = await getUserIdMapping({
        userId: externalUserId,
        userIdType: "EXTERNAL",
      });

      if (mapping.status === "OK") {
        mappedExternalUserIds.push(externalUserId);
      }
    }

    for (const superTokensUserId of superTokensUserIds) {
      await deleteUser(superTokensUserId);
      summary.superTokensUsers += 1;
    }

    for (const externalUserId of mappedExternalUserIds) {
      await deleteUserIdMapping({
        force: true,
        userId: externalUserId,
        userIdType: "EXTERNAL",
      });
      summary.superTokensMappings += 1;
    }

    logger.info(
      `Cleaned SuperTokens auth state for external user IDs: ${externalUserIds.join(", ") || "none"}`,
    );

    return summary;
  }

  async cleanupByEmail(email: string): Promise<SupertokensCleanupSummary> {
    const target = await this.resolveByEmail(email);
    return this.cleanupResolvedTarget(target);
  }

  async cleanupByExternalUserId(
    externalUserId: string,
  ): Promise<SupertokensCleanupSummary> {
    const target = await this.resolveByExternalUserId(externalUserId);
    return this.cleanupResolvedTarget(target);
  }
}

export default new SupertokensUserCleanupService();
