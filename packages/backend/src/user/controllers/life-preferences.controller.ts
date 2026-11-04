import { type Request, type Response } from "express";
import { SaveLifePreferencesSchema } from "@core/types/life-preferences.contracts";
import { zObjectId } from "@core/types/object-id.schema";
import {
  readLifePreferences,
  saveLifePreferences,
} from "@backend/user/services/life-preferences.service";

export async function getLifePreferences(req: Request, res: Response) {
  const value = await readLifePreferences(
    zObjectId.parse(req.session?.getUserId()),
  );
  res.status(value ? 200 : 404).json(value ?? { message: "User not found" });
}

export async function putLifePreferences(req: Request, res: Response) {
  const parsed = SaveLifePreferencesSchema.safeParse(req.body);
  if (
    !parsed.success ||
    (parsed.data.preferences.birthDate &&
      parsed.data.preferences.birthDate > new Date().toISOString().slice(0, 10))
  ) {
    res.status(400).json({
      message: "Choose valid life preferences and a birthday in the past",
    });
    return;
  }
  const result = await saveLifePreferences(
    zObjectId.parse(req.session?.getUserId()),
    parsed.data,
  );
  res
    .status(!result.value ? 404 : result.conflict ? 409 : 200)
    .json(result.value ?? { message: "User not found" });
}
