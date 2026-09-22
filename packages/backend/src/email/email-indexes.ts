import mongoService from "@backend/common/services/mongo.service";

export const EMAIL_SEND_STATUS_NEXT_ATTEMPT_INDEX =
  "email_send_status_next_attempt";

export const EMAIL_SEND_USER_ID_INDEX = "email_send_user_id";

export const EMAIL_SEND_PROVIDER_MESSAGE_ID_INDEX =
  "email_send_provider_message_id";

export const EMAIL_EVENT_RETENTION_SECONDS = 35 * 24 * 60 * 60;

type EmailSendIndex = {
  name?: string;
  key?: Record<string, unknown>;
};

const indexKeyMatches = (
  index: EmailSendIndex,
  key: Record<string, number>,
): boolean => JSON.stringify(index.key) === JSON.stringify(key);

const listEmailSendIndexes = async (): Promise<EmailSendIndex[]> => {
  try {
    return await mongoService.emailSend.indexes();
  } catch (error) {
    if ((error as { codeName?: string }).codeName === "NamespaceNotFound") {
      return [];
    }
    throw error;
  }
};

export async function ensureEmailIndexes(): Promise<void> {
  const existing = await listEmailSendIndexes();

  if (
    !existing.some((index) =>
      indexKeyMatches(index, { status: 1, nextAttemptAt: 1 }),
    )
  ) {
    await mongoService.emailSend.createIndex(
      { status: 1, nextAttemptAt: 1 },
      { name: EMAIL_SEND_STATUS_NEXT_ATTEMPT_INDEX },
    );
  }

  if (!existing.some((index) => indexKeyMatches(index, { userId: 1 }))) {
    await mongoService.emailSend.createIndex(
      { userId: 1 },
      { name: EMAIL_SEND_USER_ID_INDEX },
    );
  }

  if (
    !existing.some((index) => indexKeyMatches(index, { providerMessageId: 1 }))
  ) {
    await mongoService.emailSend.createIndex(
      { providerMessageId: 1 },
      {
        name: EMAIL_SEND_PROVIDER_MESSAGE_ID_INDEX,
        sparse: true,
      },
    );
  }

  await mongoService.emailEvent.createIndex(
    { receivedAt: 1 },
    {
      name: "email_event_received_at_ttl",
      expireAfterSeconds: EMAIL_EVENT_RETENTION_SECONDS,
    },
  );
}
