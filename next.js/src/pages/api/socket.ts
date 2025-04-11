import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';
import { OPCUAClient, AttributeIds } from 'node-opcua';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface ServerState {
  status: string;
  message: string;
  port: number;
}

interface CustomServer extends NetServer {
  io?: SocketIOServer;
}

const globalConnectionStates: Record<number, ServerState> = {};

const connectionStrategy = {
  initialDelay: 2000,
  maxRetry: 5,
  maxDelay: 30 * 1000,
  randomisationFactor: 0.5
};

const servers = [
  { port: 4840, name: "Server 1" },
  { port: 4841, name: "Server 2" },
  { port: 4842, name: "Server 3" }
];

async function findVariableByName(session: any, parentNodeId: string, variableName: string) {
  try {
    const browseResult = await session.browse(parentNodeId);
    for (const reference of browseResult.references || []) {
      if (reference.browseName.name === variableName) {
        return reference.nodeId;
      }
    }
  } catch (err: any) {
    console.error(`Error finding variable ${variableName}:`, err.message);
  }
  return null;
}

async function connectToServer(client: any, port: number) {
  try {
    const endpointUrl = `opc.tcp://localhost:${port}/freeopcua/server/`;
    console.log(`Trying to connect to: ${endpointUrl}`);

    await client.connect(endpointUrl);
    console.log(`Connected to OPC-UA server on port ${port}!`);
    return true;
  } catch (err: any) {
    console.error(`Connection failed for port ${port}:`, err.message);
    return false;
  }
}

async function setupServerConnection(io: SocketIOServer, serverConfig: { port: number; name: string }) {
  const { port, name } = serverConfig;

  // Initialize connection state
  globalConnectionStates[port] = {
    status: 'connecting',
    message: `Attempting to connect to ${name} (Port ${port})...`,
    port
  };
  io.emit('server-connection-status', globalConnectionStates[port]);

  try {
    const client = OPCUAClient.create({
      applicationName: `NodeOPCUA-Client-${port}`,
      connectionStrategy: connectionStrategy,
      securityMode: 1,
      securityPolicy: "None",
      endpoint_must_exist: false,
      keepSessionAlive: true,
      defaultSecureTokenLifetime: 40000,
      requestedSessionTimeout: 40000
    });

    client.on("backoff", (retry: number, delay: number) => {
      const message = `Retrying to connect to ${name} (attempt #${retry}, delay: ${delay}ms)`;
      console.log(message);
      globalConnectionStates[port] = {
        status: 'connecting',
        message,
        port
      };
      io.emit('server-connection-status', globalConnectionStates[port]);
    });

    client.on("connection_lost", () => {
      console.log(`Connection lost to ${name}!`);
      globalConnectionStates[port] = {
        status: 'disconnected',
        message: `Connection to ${name} lost! Attempting to reconnect...`,
        port
      };
      io.emit('server-connection-status', globalConnectionStates[port]);
    });

    client.on("connection_reestablished", () => {
      console.log(`Connection reestablished to ${name}!`);
      globalConnectionStates[port] = {
        status: 'connected',
        message: `Connection reestablished to ${name}`,
        port
      };
      io.emit('server-connection-status', globalConnectionStates[port]);
    });

    const connected = await connectToServer(client, port);
    if (!connected) {
      globalConnectionStates[port] = {
        status: 'error',
        message: `Failed to connect to ${name}`,
        port
      };
      io.emit('server-connection-status', globalConnectionStates[port]);
      throw new Error(`Failed to connect to ${name}`);
    }

    const session = await client.createSession();
    console.log(`Session created successfully for ${name}`);
    globalConnectionStates[port] = {
      status: 'connected',
      message: `Connected to ${name}`,
      port
    };
    io.emit('server-connection-status', globalConnectionStates[port]);

    const browseResult = await session.browse("RootFolder");
    const objectsFolder = browseResult.references?.find(ref => ref.browseName.name === "Objects");

    if (!objectsFolder) {
      throw new Error("Objects folder not found");
    }

    const objectsFolderBrowse = await session.browse(objectsFolder.nodeId.toString());
    const myObject = objectsFolderBrowse.references?.find(ref => ref.browseName.name === "MyObject");

    if (!myObject) {
      throw new Error("MyObject not found");
    }

    const temperatureNode = await findVariableByName(session, myObject.nodeId.toString(), "Temperature");
    const pressureNode = await findVariableByName(session, myObject.nodeId.toString(), "Pressure");
    const statusNode = await findVariableByName(session, myObject.nodeId.toString(), "Status");

    if (!temperatureNode || !pressureNode || !statusNode) {
      throw new Error("Failed to find all required variables");
    }

    const nodesToRead = [
      {
        nodeId: temperatureNode,
        attributeId: AttributeIds.Value
      },
      {
        nodeId: pressureNode,
        attributeId: AttributeIds.Value
      },
      {
        nodeId: statusNode,
        attributeId: AttributeIds.Value
      }
    ];

    setInterval(async () => {
      try {
        const dataValue = await session.read(nodesToRead);
        if (dataValue && dataValue.length === 3) {
          const data = {
            serverId: port,
            serverName: name,
            temperature: dataValue[0].value.value,
            pressure: dataValue[1].value.value,
            status: dataValue[2].value.value,
            timestamp: new Date().toISOString()
          };
          io.emit('opcua-data', data);
        }
      } catch (err: any) {
        console.error(`Error reading values from ${name}:`, err.message);
        globalConnectionStates[port] = {
          status: 'error',
          message: `Error reading values from ${name}: ${err.message}`,
          port
        };
        io.emit('server-connection-status', globalConnectionStates[port]);
      }
    }, 1000);

  } catch (err: any) {
    console.error(`Fatal error for ${name}:`, err.message);
    globalConnectionStates[port] = {
      status: 'error',
      message: `Fatal error for ${name}: ${err.message}`,
      port
    };
    io.emit('server-connection-status', globalConnectionStates[port]);
  }
}

const SocketHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  const server = (res.socket as any)?.server as CustomServer;
  if (!server?.io) {
    console.log('Initializing Socket.IO server...');
    if (!server) {
      console.error('HTTP server not available');
      return res.end();
    }
    const io = new SocketIOServer(server, {
      path: '/api/socket',
      addTrailingSlash: false,
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['*']
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['polling', 'websocket'],
      allowEIO3: true
    });
    server.io = io;

    io.on('connection', (socket) => {
      console.log('Client connected', socket.id);

      socket.on('request-connection-status', () => {
        console.log('Received connection status request');
        socket.emit('all-connection-status', globalConnectionStates);
      });

      socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', socket.id, reason);
      });

      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    });

    // Setup connections to all OPC-UA servers
    servers.forEach(server => {
      setupServerConnection(io, server);
    });
  }

  res.end();
};

export default SocketHandler;