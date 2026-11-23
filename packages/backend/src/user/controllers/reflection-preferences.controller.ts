import { type Request, type Response } from "express";
import {
  ReflectionCalendarVisibilitySchema,
  ReflectionPreferencesSchema,
} from "@core/types/life-preferences.contracts";
import { zObjectId } from "@core/types/object-id.schema";
import mongoService from "@backend/common/services/mongo.service";
import {
  reflectionAvailable,
  reflectionEnableBlock,
  setReflectionEnabled,
} from "@backend/email/reflection-opt-in";

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
    available: reflectionAvailable(),
    paused: !!user.emailPreferences?.reflectionDisabledAt,
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
    const blocked = reflectionEnableBlock(user);
    if (blocked) {
      res.status(403).json({ message: blocked });
      return;
    }
  }
  await setReflectionEnabled(user, input.data, "settings");
  res.json({
    preferences: input.data,
    available: reflectionAvailable(),
    paused: !input.data.enabled,
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
