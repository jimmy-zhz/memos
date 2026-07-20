import type { FC } from "react";
import { Button } from "@/components/ui/button";
import type { Location, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import { validationService } from "../services";
import { useEditorContext, useEditorSelector } from "../state";
import type { EditorToolbarProps } from "../types";
import InsertMenu from "./InsertMenu";
import VisibilitySelector from "./VisibilitySelector";

// Bottom bar for the comment sidebars (PDF annotations, notebook doc comments).
// Same controls as EditorToolbar, sized for a ~320px docked column: icon-only
// visibility trigger and small text buttons instead of full-size ones.
export const CommentToolbar: FC<EditorToolbarProps> = ({
  onSave,
  onCancel,
  memoName,
  onAudioRecorderClick,
  isFormattingToolbarVisible,
  onToggleFormattingToolbar,
  onInsertProperties,
}) => {
  const t = useTranslate();
  const { actions, dispatch } = useEditorContext();
  const valid = useEditorSelector((s) => validationService.canSave(s).valid);
  const isSaving = useEditorSelector((s) => s.ui.isLoading.saving);
  const isUploading = useEditorSelector((s) => s.ui.isLoading.uploading);
  const location = useEditorSelector((s) => s.metadata.location);
  const visibility = useEditorSelector((s) => s.metadata.visibility);

  const handleLocationChange = (next?: Location) => {
    dispatch(actions.setMetadata({ location: next }));
  };

  const handleToggleFocusMode = () => {
    dispatch(actions.toggleFocusMode());
  };

  const handleVisibilityChange = (next: Visibility) => {
    dispatch(actions.setMetadata({ visibility: next }));
  };

  return (
    <div className="w-full flex flex-row justify-between items-center gap-1 mb-0">
      <div className="flex flex-row justify-start items-center shrink-0">
        <InsertMenu
          isUploading={isUploading}
          location={location}
          onLocationChange={handleLocationChange}
          onToggleFocusMode={handleToggleFocusMode}
          memoName={memoName}
          onAudioRecorderClick={onAudioRecorderClick}
          isFormattingToolbarVisible={isFormattingToolbarVisible}
          onToggleFormattingToolbar={onToggleFormattingToolbar}
          onInsertProperties={onInsertProperties}
        />
        <VisibilitySelector value={visibility} onChange={handleVisibilityChange} iconOnly />
      </div>

      <div className="flex flex-row justify-end items-center gap-0.5 shrink-0">
        {onCancel && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCancel} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
        )}

        <Button size="sm" className="h-7 px-2.5 text-xs" onClick={onSave} disabled={!valid || isSaving}>
          {isSaving ? t("editor.saving") : t("editor.save")}
        </Button>
      </div>
    </div>
  );
};
