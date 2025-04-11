const { OPCUAClient, AttributeIds } = require("node-opcua");
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

async function main() {
    try {
        // Create client
        const client = OPCUAClient.create({
            endpoint_must_exist: false,
            connectionStrategy: {
                maxRetry: 5,
                initialDelay: 1000,
                maxDelay: 20000
            }
        });

        // Connect to server
        await client.connect("opc.tcp://localhost:4840/freeopcua/server/");
        console.log("Connected to OPC-UA server");

        // Create session
        const session = await client.createSession();
        console.log("OPC-UA session created");

        // Read variables
        const nodesToRead = [
            {
                nodeId: "ns=2;s=MyObject/Temperature",
                attributeId: AttributeIds.Value
            },
            {
                nodeId: "ns=2;s=MyObject/Pressure",
                attributeId: AttributeIds.Value
            },
            {
                nodeId: "ns=2;s=MyObject/Status",
                attributeId: AttributeIds.Value
            }
        ];

        // Start HTTP server
        http.listen(3000, () => {
            console.log('Web server listening on http://localhost:3000');
        });

        // Read values every second and emit to connected clients
        setInterval(async () => {
            try {
                const dataValue = await session.read(nodesToRead);
                const data = {
                    temperature: dataValue[0].value.value,
                    pressure: dataValue[1].value.value,
                    status: dataValue[2].value.value,
                    timestamp: new Date().toISOString()
                };
                io.emit('opcua-data', data);
            } catch (err) {
                console.error("Error reading values:", err);
            }
        }, 1000);

        // Handle process termination
        process.on("SIGINT", async () => {
            console.log("Closing session...");
            await session.close();
            await client.disconnect();
            process.exit(0);
        });

    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

main();