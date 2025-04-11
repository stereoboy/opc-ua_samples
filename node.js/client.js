const { OPCUAClient, AttributeIds, resolveNodeId } = require("node-opcua");
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Serve static files from the public directory
app.use(express.static('public'));

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

const connectionStrategy = {
    initialDelay: 1000,
    maxRetry: 10,
    maxDelay: 10 * 1000
};

// Configuration for multiple servers
const servers = [
    { port: 4840, name: "Server 1" },
    { port: 4841, name: "Server 2" },
    { port: 4842, name: "Server 3" }
];

// Global state to track OPC-UA connections status
const globalConnectionStates = {};

async function findVariableByName(session, parentNodeId, variableName) {
    try {
        const browseResult = await session.browse(parentNodeId);
        for (const reference of browseResult.references) {
            if (reference.browseName.name === variableName) {
                return reference.nodeId;
            }
        }
    } catch (err) {
        console.error(`Error finding variable ${variableName}:`, err.message);
    }
    return null;
}

async function connectToServer(client, port) {
    try {
        const endpointUrl = `opc.tcp://localhost:${port}/freeopcua/server/`;
        console.log(`Trying to connect to: ${endpointUrl}`);
        await client.connect(endpointUrl);
        console.log(`Connected to OPC-UA server on port ${port}!`);
        return true;
    } catch (err) {
        console.error(`Connection failed for port ${port}:`, err.message);
        return false;
    }
}

// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log('Web client connected');

    // Send current connection states to newly connected clients
    socket.emit('all-connection-status', globalConnectionStates);

    // Handle connection status requests
    socket.on('request-connection-status', () => {
        socket.emit('all-connection-status', globalConnectionStates);
    });
});

async function setupServerConnection(serverConfig) {
    const { port, name } = serverConfig;

    try {
        // Create client
        const client = OPCUAClient.create({
            applicationName: `NodeOPCUA-Client-${port}`,
            connectionStrategy: connectionStrategy,
            securityMode: 1,
            securityPolicy: "None",
            endpoint_must_exist: false
        });

        // Initialize connection state
        globalConnectionStates[port] = {
            status: 'connecting',
            message: `Attempting to connect to ${name} (Port ${port})...`,
            port: port
        };
        io.emit('server-connection-status', globalConnectionStates[port]);

        // Handle client events
        client.on("backoff", (retry, delay) => {
            const message = `Retrying to connect to ${name} (attempt #${retry}, delay: ${delay}ms)`;
            console.log(message);
            globalConnectionStates[port] = {
                status: 'connecting',
                message: message,
                port: port
            };
            io.emit('server-connection-status', globalConnectionStates[port]);
        });

        client.on("connection_lost", () => {
            console.log(`Connection lost to ${name}!`);
            globalConnectionStates[port] = {
                status: 'disconnected',
                message: `Connection to ${name} lost! Attempting to reconnect...`,
                port: port
            };
            io.emit('server-connection-status', globalConnectionStates[port]);
        });

        client.on("connection_reestablished", () => {
            console.log(`Connection reestablished to ${name}!`);
            globalConnectionStates[port] = {
                status: 'connected',
                message: `Connection reestablished to ${name}`,
                port: port
            };
            io.emit('server-connection-status', globalConnectionStates[port]);
        });

        const connected = await connectToServer(client, port);
        if (!connected) {
            globalConnectionStates[port] = {
                status: 'error',
                message: `Failed to connect to ${name}`,
                port: port
            };
            io.emit('server-connection-status', globalConnectionStates[port]);
            throw new Error(`Failed to connect to ${name}`);
        }

        // Create session
        const session = await client.createSession();
        console.log(`Session created successfully for ${name}`);
        globalConnectionStates[port] = {
            status: 'connected',
            message: `Connected to ${name}`,
            port: port
        };
        io.emit('server-connection-status', globalConnectionStates[port]);

        // Find MyObject node
        const browseResult = await session.browse("RootFolder");
        const objectsFolder = browseResult.references.find(ref => ref.browseName.name === "Objects");

        if (!objectsFolder) {
            throw new Error("Objects folder not found");
        }

        const objectsFolderBrowse = await session.browse(objectsFolder.nodeId.toString());
        const myObject = objectsFolderBrowse.references.find(ref => ref.browseName.name === "MyObject");

        if (!myObject) {
            throw new Error("MyObject not found");
        }

        // Find variable nodes by name
        const temperatureNode = await findVariableByName(session, myObject.nodeId.toString(), "Temperature");
        const pressureNode = await findVariableByName(session, myObject.nodeId.toString(), "Pressure");
        const statusNode = await findVariableByName(session, myObject.nodeId.toString(), "Status");

        if (!temperatureNode || !pressureNode || !statusNode) {
            throw new Error("Failed to find all required variables");
        }

        // Read variables using the found node IDs
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

        // Read values every second and emit to connected clients
        const intervalId = setInterval(async () => {
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
            } catch (err) {
                console.error(`Error reading values from ${name}:`, err.message);
                globalConnectionStates[port] = {
                    status: 'error',
                    message: `Error reading values from ${name}: ${err.message}`,
                    port: port
                };
                io.emit('server-connection-status', globalConnectionStates[port]);
            }
        }, 1000);

        // Handle process termination
        process.on("SIGINT", async () => {
            console.log(`Closing session for ${name}...`);
            clearInterval(intervalId);
            await session.close();
            await client.disconnect();
            process.exit(0);
        });

    } catch (err) {
        console.error(`Fatal error for ${name}:`, err.message);
        globalConnectionStates[port] = {
            status: 'error',
            message: `Fatal error for ${name}: ${err.message}`,
            port: port
        };
        io.emit('server-connection-status', globalConnectionStates[port]);
    }
}

async function main() {
    // Start HTTP server
    http.listen(3000, () => {
        console.log('Web server listening on http://localhost:3000');
    });

    // Connect to all servers
    servers.forEach(server => {
        setupServerConnection(server);
    });
}

main();