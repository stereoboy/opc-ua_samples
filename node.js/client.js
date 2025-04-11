const { OPCUAClient, AttributeIds, resolveNodeId, browse_service } = require("node-opcua");
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

// Global state to track OPC-UA connection status
let globalConnectionState = {
    status: 'initializing',
    message: 'Starting up...'
};

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

async function connectToServer(client) {
    try {
        const endpointUrl = "opc.tcp://localhost:4840/freeopcua/server/";
        console.log("Trying to connect to:", endpointUrl);
        await client.connect(endpointUrl);
        console.log("Connected to OPC-UA server!");
        globalConnectionState = {
            status: 'connected',
            message: 'Connected to OPC-UA server'
        };
        return true;
    } catch (err) {
        console.error("Connection failed:", err.message);
        globalConnectionState = {
            status: 'error',
            message: 'Connection failed: ' + err.message
        };
        return false;
    }
}

// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log('Web client connected');
    // Send current connection state to newly connected clients
    socket.emit('connection-status', globalConnectionState);
});

async function main() {
    try {
        // Start HTTP server first so we can show connection status
        http.listen(3000, () => {
            console.log('Web server listening on http://localhost:3000');
        });

        // Create client
        const client = OPCUAClient.create({
            applicationName: "NodeOPCUA-Client",
            connectionStrategy: connectionStrategy,
            securityMode: 1,
            securityPolicy: "None",
            endpoint_must_exist: false
        });

        // Handle client events
        client.on("backoff", (retry, delay) => {
            const message = `Retrying to connect (attempt #${retry}, delay: ${delay}ms)`;
            console.log(message);
            globalConnectionState = {
                status: 'connecting',
                message: message
            };
            io.emit('connection-status', globalConnectionState);
        });

        client.on("connection_lost", () => {
            console.log("Connection lost!");
            globalConnectionState = {
                status: 'disconnected',
                message: 'Connection to OPC-UA server lost! Attempting to reconnect...'
            };
            io.emit('connection-status', globalConnectionState);
        });

        client.on("connection_reestablished", () => {
            console.log("Connection reestablished!");
            globalConnectionState = {
                status: 'connected',
                message: 'Connection reestablished'
            };
            io.emit('connection-status', globalConnectionState);
        });

        // Initial connection attempt
        globalConnectionState = {
            status: 'connecting',
            message: 'Attempting to connect to OPC-UA server...'
        };
        io.emit('connection-status', globalConnectionState);

        const connected = await connectToServer(client);
        if (!connected) {
            throw new Error("Failed to connect to OPC-UA server");
        }

        // Create session
        const session = await client.createSession();
        console.log("Session created successfully");
        globalConnectionState = {
            status: 'connected',
            message: 'Connected and session created'
        };
        io.emit('connection-status', globalConnectionState);

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

        console.log("Found MyObject:", myObject.nodeId.toString());

        // Find variable nodes by name
        const temperatureNode = await findVariableByName(session, myObject.nodeId.toString(), "Temperature");
        const pressureNode = await findVariableByName(session, myObject.nodeId.toString(), "Pressure");
        const statusNode = await findVariableByName(session, myObject.nodeId.toString(), "Status");

        console.log("temperatureNode:", temperatureNode);
        console.log("pressureNode:", pressureNode);
        console.log("statusNode:", statusNode);

        if (!temperatureNode || !pressureNode || !statusNode) {
            throw new Error("Failed to find all required variables");
        }

        console.log("Found nodes:", {
            Temperature: temperatureNode.toString(),
            Pressure: pressureNode.toString(),
            Status: statusNode.toString()
        });

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
                    console.log("Read values:", {
                        temperature: dataValue[0].value.value,
                        pressure: dataValue[1].value.value,
                        status: dataValue[2].value.value
                    });

                    const data = {
                        temperature: dataValue[0].value.value,
                        pressure: dataValue[1].value.value,
                        status: dataValue[2].value.value,
                        timestamp: new Date().toISOString()
                    };
                    io.emit('opcua-data', data);
                } else {
                    console.error("Invalid data format received");
                }
            } catch (err) {
                console.error("Error reading values:", err.message);
                globalConnectionState = {
                    status: 'error',
                    message: 'Error reading values: ' + err.message
                };
                io.emit('connection-status', globalConnectionState);
            }
        }, 1000);

        // Handle process termination
        process.on("SIGINT", async () => {
            console.log("Closing session...");
            clearInterval(intervalId);
            await session.close();
            await client.disconnect();
            globalConnectionState = {
                status: 'disconnected',
                message: 'Connection closed'
            };
            io.emit('connection-status', globalConnectionState);
            process.exit(0);
        });

    } catch (err) {
        console.error("Fatal error:", err.message);
        globalConnectionState = {
            status: 'error',
            message: 'Fatal error: ' + err.message
        };
        io.emit('connection-status', globalConnectionState);
        process.exit(1);
    }
}

main();