"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

import { acquireSocket, releaseSocket, subscribeSocketChannel } from "@/lib/socket-client";

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  useEffect(() => {
    const connection = acquireSocket();
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    connection.on("connect", onConnect);
    connection.on("disconnect", onDisconnect);
    setSocket(connection);
    setIsConnected(connection.connected);
    return () => {
      connection.off("connect", onConnect);
      connection.off("disconnect", onDisconnect);
      releaseSocket(connection);
    };
  }, []);
  return { socket, isConnected };
}

function useChannel(
  channel: import("@/lib/socket-contract").SocketChannel,
  id?: string,
  enabled = true
) {
  const connection = useSocket();
  useEffect(() => {
    if (connection.socket && enabled) return subscribeSocketChannel(connection.socket, channel, id);
  }, [connection.socket, channel, id, enabled]);
  return connection;
}
export function useStaffSocket(staffId = "general") {
  return useChannel("staff", staffId);
}
export function useDJSocket() {
  return useChannel("dj");
}
export function useCashierSocket() {
  return useChannel("cashier");
}
export function useWaiterSocket(id?: string) {
  return useChannel("waiter", id, !!id);
}
export function useLocationSocket(id?: string) {
  return useChannel("location", id, !!id);
}
export function useServicePointSocket(id?: string) {
  return useChannel("servicePoint", id, !!id);
}
export function useTableSocket(id?: string) {
  return useChannel("table", id, !!id);
}
export function useMenuSocket() {
  const connection = useChannel("staff", "general");
  useEffect(() => {
    if (connection.socket) return subscribeSocketChannel(connection.socket, "cashier");
  }, [connection.socket]);
  return connection;
}
