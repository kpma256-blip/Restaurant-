// Simplified shapes of the Toast API responses this integration consumes.
// These are intentionally loose (lots of optional fields) because Toast's
// real payloads carry many more fields than we use — and because exact
// field names should be re-verified against the current Toast Platform API
// docs (https://doc.toasttab.com/openapi/) before going live; Toast has
// changed response shapes across API versions before. Treat this file as
// the ONE place that needs updating if that happens.

export interface ToastModifierOptionRef {
  guid: string;
  name?: string;
}

export interface ToastMenuItem {
  guid: string;
  name: string;
  price?: number;
  visibility?: string;
}

export interface ToastMenuGroup {
  guid: string;
  name: string;
  items?: ToastMenuItem[];
  subgroups?: ToastMenuGroup[];
}

export interface ToastMenu {
  guid: string;
  name: string;
  groups?: ToastMenuGroup[];
}

export interface ToastMenusResponse {
  menus: ToastMenu[];
}

export interface ToastSelectionModifier {
  guid: string;
  displayName?: string;
  optionGroup?: { guid: string; name?: string };
}

export interface ToastOrderSelection {
  guid: string;
  itemGuid?: string; // references a ToastMenuItem.guid
  displayName?: string;
  quantity: number;
  voided?: boolean;
  modifiers?: ToastSelectionModifier[];
  price?: number;
}

export interface ToastCheck {
  guid: string;
  selections: ToastOrderSelection[];
  totalAmount?: number;
}

export interface ToastOrder {
  guid: string;
  businessDate?: number; // yyyymmdd int, per Toast convention
  openedDate?: string; // ISO timestamp
  closedDate?: string;
  voided?: boolean;
  checks: ToastCheck[];
}
