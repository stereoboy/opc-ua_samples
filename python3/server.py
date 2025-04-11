from opcua import ua, Server
import time
import math

def main():
    # Create a new server
    server = Server()

    # Set server endpoint
    server.set_endpoint("opc.tcp://0.0.0.0:4840/freeopcua/server/")

    # Set server name
    server.set_server_name("OPC-UA Sample Server")

    # Setup namespace
    uri = "http://examples.freeopcua.github.io"
    idx = server.register_namespace(uri)

    # Get Objects node
    objects = server.get_objects_node()

    # Create a new object
    myobj = objects.add_object(idx, "MyObject")

    # Add some variables with initial values
    myvar1 = myobj.add_variable(idx, "Temperature", 25.0)
    myvar2 = myobj.add_variable(idx, "Pressure", 1013.25)  # Standard atmospheric pressure in hPa
    myvar3 = myobj.add_variable(idx, "Status", "Running")

    # Make variables writable
    myvar1.set_writable()
    myvar2.set_writable()
    myvar3.set_writable()

    print("Starting OPC-UA server...")
    # Start server
    server.start()
    print("OPC-UA server is running on opc.tcp://0.0.0.0:4840/freeopcua/server/")

    try:
        # Simulate data changes
        time_offset = 0
        while True:
            # Simulate temperature variation (sine wave between 20°C and 30°C)
            temperature = 25.0 + 5.0 * math.sin(time_offset * 0.1)
            myvar1.set_value(temperature)

            # Simulate pressure variation (random walk around standard atmospheric pressure)
            current_pressure = myvar2.get_value()
            pressure_change = (math.sin(time_offset * 0.05) * 2.0)  # Vary by ±2 hPa
            new_pressure = current_pressure + pressure_change
            myvar2.set_value(new_pressure)

            # Toggle status every 5 seconds
            if int(time_offset) % 5 == 0:
                current_status = myvar3.get_value()
                new_status = "Stopped" if current_status == "Running" else "Running"
                myvar3.set_value(new_status)

            print(f"Updated values - Temperature: {temperature:.1f}°C, Pressure: {new_pressure:.1f}hPa, Status: {myvar3.get_value()}")

            time.sleep(1)
            time_offset += 1

    finally:
        # Close connection
        server.stop()
        print("OPC-UA server stopped.")

if __name__ == "__main__":
    main()