// One transport contract for the custom server, Next bootstrap and all clients.
export const SOCKET_PATH = process.env.NEXT_PUBLIC_SOCKET_PATH || "/socket.io";
export const SOCKET_BOOTSTRAP_PATH = "/api/socketio";
export const SOCKET_BOOTSTRAP_RETRY_MS = 5000;

// Existing wire names remain stable; joins and leaves share one room definition.
export const SOCKET_CHANNELS = {
  staff: { event: "join-staff", leave: "leave-staff", room: (id = "general") => `staff-${id}` },
  dj: { event: "join-dj", leave: "leave-dj", room: () => "dj-console" },
  cashier: { event: "join-cashier", leave: "leave-cashier", room: () => "cashier" },
  tasks: { event: "join-admin-tasks", leave: "leave-admin-tasks", room: () => "admin-tasks" },
  waiter: { event: "join-waiter", leave: "leave-waiter", room: (id: string) => `waiter-${id}` },
  location: {
    event: "join-location",
    leave: "leave-location",
    room: (id: string) => `location-${id}`,
  },
  servicePoint: {
    event: "join-service-point",
    leave: "leave-service-point",
    room: (id: string) => `service-point-${id}`,
  },
  table: { event: "join-table", leave: "leave-table", room: (id: string) => `table-${id}` },
} as const;
export type SocketChannel = keyof typeof SOCKET_CHANNELS;
