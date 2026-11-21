/**
 * LUMA User-Level Intent Definitions
 */

export type UserIntentType =
  | "OPEN_APP"
  | "CLOSE_APP"
  | "FOCUS_APP"
  | "OPEN_WEBSITE"
  | "OPEN_OR_SEARCH_WEBSITE"
  | "SEARCH"
  | "SEARCH_WEB"
  | "SEARCH_PRODUCT"
  | "OPEN_FOLDER"
  | "CREATE_FOLDER"
  | "OPEN_FILE"
  | "DELETE"
  | "COPY"
  | "PASTE"
  | "SELECT"
  | "SCROLL"
  | "PLAY_MEDIA"
  | "PAUSE_MEDIA"
  | "RESUME_MEDIA"
  | "STOP_MEDIA"
  | "NEXT_MEDIA"
  | "PREV_MEDIA"
  | "VOLUME_UP"
  | "VOLUME_DOWN"
  | "MUTE_MEDIA"
  | "PLAY_FIRST_RESULT"
  | "YOUTUBE_CREATE_PLAYLIST"
  | "YOUTUBE_ADD_TO_PLAYLIST"
  | "YOUTUBE_PLAY_PLAYLIST"
  | "YOUTUBE_OPEN_PLAYLIST"
  | "YOUTUBE_REMOVE_FROM_PLAYLIST"
  | "TAKE_SCREENSHOT"
  | "CHECK_SYSTEM"
  | "GET_ACTIVE_WINDOW"
  | "GET_VISIBLE_WINDOWS"
  | "GET_INSTALLED_APPS"
  | "GET_BACKGROUND_PROCESSES"
  | "RESTORE_APP"
  | "INSPECT_COMPUTER"
  | "TYPE_TEXT"
  | "PRESS_KEY"
  | "CONFIRM_ACTION"
  | "CANCEL_ACTION"
  | "COMPOUND_GOAL"
  | "UNKNOWN";

export interface IntentMatchResult {
  matched: boolean;
  intent: UserIntentType;
  ruleName: string;
  arguments: Record<string, any>;
  toolToExecute?: string;
  validationError?: string;
  subCommands?: string[];
}
