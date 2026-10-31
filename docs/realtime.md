# Tiempo real

## Transporte único

`src/lib/socket.ts` inicializa una sola instancia por proceso. `server.js` y
`src/pages/api/socketio.ts` comparten ese inicializador. Todos los emisores de
pedidos, entradas, música, tareas, ofertas y OTP usan esa instancia; no existe
la antigua dependencia de `global.io`.

`src/lib/socket-client.ts` comparte una conexión por pestaña y cuenta sus consumidores.
`subscribeSocketChannel` cuenta suscripciones por sala, se reinscribe al reconectar
y abandona la sala cuando sale su último consumidor. Los listeners se eliminan
por referencia, sin afectar a otras pantallas.

Los nombres de salas y los mensajes para entrar/salir están en
`src/lib/socket-contract.ts`. Los nombres del protocolo existente se conservan.
Los pedidos se notifican desde su API tras persistirlos; el cliente ya no puede
reenviar pedidos o estados inventados mediante el antiguo relay.

## Configuración

- `NEXT_PUBLIC_SOCKET_PATH`: ruta del transporte (por defecto `/socket.io`).
- `NEXT_PUBLIC_SOCKET_URL`: origen del servidor si se despliega separado; por defecto el origen actual.
- `SOCKET_ALLOWED_ORIGINS`: lista de orígenes permitidos separados por comas;
  sin ella solo se acepta el mismo host. Los clientes nativos sin Origin se permiten.

No se agregan servicios externos ni cambios de base de datos.

## OTP

Las suscripciones OTP validan la sesión en el servidor. Solo envían una invalidación;
las claves se consultan por HTTP privado. El colaborador recibe sus cambios y los
administradores reciben cambios administrativos. Se conserva recuperación por
reconexión, foco, vencimiento y consulta periódica. Véase `prize-authorization.md`.

## Alcance y límites

La conexión y los emisores están unificados por proceso. Varias réplicas necesitarán
un adaptador distribuido para eventos instantáneos entre ellas; la actualización
periódica de OTP sigue funcionando sin él. No se ha incorporado esa infraestructura.
Las salas históricas de menú/pedidos mantienen su contrato de acceso público;
no deben usarse para secretos o documentos privados. Las salas OTP y la sala
administrativa de ofertas validan identidad antes de suscribir.
Los sockets son notificaciones: los permisos y la persistencia siguen en las APIs.

## Verificación segura

`npx vitest run tests/realtime tests/prize-authorization` usa HTTP y sockets en
puertos efímeros y dependencias de datos simuladas. No ejecutar suites generales
que reseteen datos para comprobar tiempo real. `npm run typecheck` valida tipos.
