export const STATION_INVITATION_PREFIX = "golounge-station:";
export const STATION_INVITATION_TTL_MS = 2 * 60 * 1000;
export const STATION_SCAN_MAX_LENGTH = 4096;
export const STATION_SESSION_KEY = "golounge.station.id";
export const STATION_PAIR_KEY = "golounge.station.invitation";
export const STATION_TERMINAL_KEY = "golounge.station.terminal";
export const STATION_JOIN_EVENT = "station:join";
export const STATION_LEAVE_EVENT = "station:leave";
export const STATION_REFRESH_EVENT = "station:refresh";
export const stationRoom = (id: string) => `operation-station:${id}`;
export const STATION_REFRESH_INTERVAL_MS = 5000;
export const STATION_PENDING_KEY = "golounge.station.pending";
export const STATION_TERMINAL_OFFLINE_AFTER_MS = 3 * STATION_REFRESH_INTERVAL_MS;

export const STATION_READINGS_PAGE_SIZE = 100;
