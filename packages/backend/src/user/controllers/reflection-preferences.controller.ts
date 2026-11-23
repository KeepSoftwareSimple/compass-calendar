import { type Request, type Response } from "express";
import {
  ReflectionCalendarVisibilitySchema,
  ReflectionPreferencesSchema,
} from "@core/types/life-preferences.contracts";
import { zObjectId } from "@core/types/object-id.schema";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { reflectionCalendarContext } from "@backend/email/reflection-context";

const available = () => !!CONFIG.EMAIL_PROVIDER && CONFIG.REFLECTION_ENABLED;

export async function getReflectionPreferences(req: Request, res: Response) {
  const id = zObjectId.parse(req.session?.getUserId());
  const user = await mongoService.user.findOne({ _id: id });
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  const saved = user.reflectionPreferences
    ? ReflectionPreferencesSchema.safeParse({
        enabled: user.reflectionPreferences.enabled,
        timeZone: user.reflectionPreferences.timeZone,
        excludedCalendarIds: user.reflectionPreferences.excludedCalendarIds,
      })
    : null;
  res.json({
    preferences: saved?.success ? saved.data : null,
    available: available(),
  });
}

export async function putReflectionPreferences(req: Request, res: Response) {
  const input = ReflectionPreferencesSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ message: "Choose valid reflection settings" });
    return;
  }
  const id = zObjectId.parse(req.session?.getUserId());
  const user = await mongoService.user.findOne({ _id: id });
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  if (input.data.enabled) {
    if (
      !available() ||
      user.isSynthetic ||
      user.emailPreferences?.suppressedAt
    ) {
      res
        .status(403)
        .json({ message: "Reflections are not available for this account" });
      return;
    }
    const context = await reflectionCalendarContext({
      ...user,
      reflectionPreferences: input.data,
    });
    const history = await context.client.readReflection(context.principal, {
      calendarIds: context.calendarIds,
      selfEmails: context.selfEmails,
      windows: [],
    });
    if (!history.ok || !history.value.historyComplete) {
      res
        .status(409)
        .json({ message: "Your calendar history is still being prepared" });
      return;
    }
  }
  await mongoService.user.updateOne(
    { _id: id },
    {
      $set: {
        reflectionPreferences: {
          ...input.data,
          ...(input.data.enabled ? { optedInAt: new Date() } : {}),
        },
        ...(!input.data.enabled
          ? { "emailPreferences.reflectionDisabledAt": new Date() }
          : {}),
      },
      $unset: {
        reflectionNextSendAt: "",
        ...(input.data.enabled
          ? { "emailPreferences.reflectionDisabledAt": "" }
          : {}),
      },
    },
  );
  await emailSendRepository.cancelQueuedReflection(id, !input.data.enabled);
  res.json({
    preferences: input.data,
    available: available(),
  });
}

export async function patchReflectionCalendarVisibility(
  req: Request,
  res: Response,
) {
  const input = ReflectionCalendarVisibilitySchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ message: "Choose a valid calendar" });
    return;
  }
  const id = zObjectId.parse(req.session?.getUserId());
  const { calendarId, isVisible } = input.data;
  const filter = { _id: id, reflectionPreferences: { $exists: true } };
  if (isVisible)
    await mongoService.user.updateOne(filter, {
      $pull: { "reflectionPreferences.excludedCalendarIds": calendarId },
    });
  else
    await mongoService.user.updateOne(filter, {
      $addToSet: { "reflectionPreferences.excludedCalendarIds": calendarId },
    });
  res.status(204).end();
}
