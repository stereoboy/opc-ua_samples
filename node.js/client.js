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

// Global state to track OPC-UA connection status
let globalConnectionState = {
    status: 'initializing',
    message: 'Starting up...'
};

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

        // Browse root folder to find objects
        const browseResult = await session.browse("RootFolder");
        console.log("Root folder contents:", browseResult.references.map(ref => ({
            nodeId: ref.nodeId.toString(),
            browseName: ref.browseName.toString()
        })));

        // Find Objects folder and browse it
        const objectsFolder = browseResult.references.find(ref => ref.browseName.name === "Objects");
        if (objectsFolder) {
            const objectsFolderBrowse = await session.browse(objectsFolder.nodeId.toString());
            console.log("Objects folder contents:", objectsFolderBrowse.references.map(ref => ({
                nodeId: ref.nodeId.toString(),
                browseName: ref.browseName.toString()
            })));

            // Browse MyObject to get its variables
            const myObject = objectsFolderBrowse.references.find(ref => ref.browseName.name === "MyObject");
            if (myObject) {
                const myObjectBrowse = await session.browse(myObject.nodeId.toString());
                console.log("MyObject contents:", myObjectBrowse.references.map(ref => ({
                    nodeId: ref.nodeId.toString(),
                    browseName: ref.browseName.toString()
                })));
            }
        }

        // Read variables using the correct namespace index and path
        const nodesToRead = [
            {
                nodeId: "ns=2;i=2",  // Temperature
                attributeId: AttributeIds.Value
            },
            {
                nodeId: "ns=2;i=3",  // Pressure
                attributeId: AttributeIds.Value
            },
            {
                nodeId: "ns=2;i=4",  // Status
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