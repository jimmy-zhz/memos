import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { useCallback } from "react";
import { userServiceClient } from "@/connect";
import { buildUserSettingName } from "@/helpers/resource-names";
import { UserSetting_Key, UserSettingSchema } from "@/types/proto/api/v1/user_service_pb";

interface LastOpened {
  // The last workspace opened, across all workspaces.
  workspace: string;
  // Map of workspace resource name to the last memo opened within it.
  workspaceMemos: Record<string, string>;
}

// Reads and writes the LAST_OPENED user setting (last workspace opened, plus the
// last memo opened within each workspace), so the page can restore the user's
// place on load and jump to the right doc when switching workspaces.
export function useLastOpened(currentUserName?: string) {
  const getLastOpened = useCallback(async (): Promise<LastOpened | undefined> => {
    if (!currentUserName) return undefined;
    try {
      const name = buildUserSettingName(currentUserName, UserSetting_Key.LAST_OPENED);
      const setting = await userServiceClient.getUserSetting({ name });
      if (setting.value.case === "lastOpenedSetting") {
        return {
          workspace: setting.value.value.workspace,
          workspaceMemos: { ...setting.value.value.workspaceMemos },
        };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }, [currentUserName]);

  const setLastOpened = useCallback(
    async (workspace: string, memo: string) => {
      if (!currentUserName) return;
      const name = buildUserSettingName(currentUserName, UserSetting_Key.LAST_OPENED);
      try {
        const existing = await getLastOpened();
        const workspaceMemos = { ...existing?.workspaceMemos };
        if (memo) {
          workspaceMemos[workspace] = memo;
        }
        const setting = create(UserSettingSchema, {
          name,
          value: {
            case: "lastOpenedSetting",
            value: { workspace, memo, workspaceMemos },
          },
        });
        await userServiceClient.updateUserSetting({
          setting,
          updateMask: create(FieldMaskSchema, {
            paths: ["lastOpenedSetting"],
          }),
        });
      } catch {
        // Best-effort; failing to persist the last-opened pointer shouldn't block the UI.
      }
    },
    [currentUserName, getLastOpened],
  );

  return { getLastOpened, setLastOpened };
}
