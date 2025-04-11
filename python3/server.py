from opcua import ua, Server
import time

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

    # Add some variables
    myvar1 = myobj.add_variable(idx, "Temperature", 25.0)
    myvar2 = myobj.add_variable(idx, "Pressure", 1.0)
    myvar3 = myobj.add_variable(idx, "Status", "Running")

    # Make variables writable
    myvar1.set_writable()
    myvar2.set_writable()
    myvar3.set_writable()

    # Start server
    server.start()

    try:
        # Update variables
        count = 0
        while True:
            time.sleep(1)
            count += 0.1
            myvar1.set_value(25.0 + count)
            myvar2.set_value(1.0 + count/10)
            if count % 2 == 0:
                myvar3.set_value("Running")
            else:
                myvar3.set_value("Stopped")

    finally:
        # Close connection
        server.stop()

if __name__ == "__main__":
    main()