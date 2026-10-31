/** Fixed desktop width for every bottom-left notice (web + CSS). */
export const BOTTOM_NOTICE_DESKTOP_WIDTH_PX = 336;

/** Lower number wins when multiple notices are eligible. */
export const BOTTOM_NOTICE_QUEUE_ID = {
  appUpdate: "appUpdate",
  firstEvent: "firstEvent",
  localModeConnect: "localModeConnect",
  upNext: "upNext",
  ephemeralToast: "ephemeralToast",
} as const;

export type BottomNoticeQueueId =
  (typeof BOTTOM_NOTICE_QUEUE_ID)[keyof typeof BOTTOM_NOTICE_QUEUE_ID];

export const BOTTOM_NOTICE_PRIORITY: Record<BottomNoticeQueueId, number> = {
  [BOTTOM_NOTICE_QUEUE_ID.appUpdate]: 0,
  [BOTTOM_NOTICE_QUEUE_ID.firstEvent]: 10,
  [BOTTOM_NOTICE_QUEUE_ID.localModeConnect]: 20,
  [BOTTOM_NOTICE_QUEUE_ID.upNext]: 30,
  [BOTTOM_NOTICE_QUEUE_ID.ephemeralToast]: 40,
};
