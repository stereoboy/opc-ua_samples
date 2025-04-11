# opc-ua_samples



## Javascript
### node-opcua
* https://node-opcua.github.io/
* https://www.npmjs.com/package/node-opcua
## Python
### FreeOpcUa
* https://python-opcua.readthedocs.io/en/latest/
* https://github.com/FreeOpcUa/python-opcua
## C/C++
### FreeOpcUa
* https://github.com/FreeOpcUa/freeopcua
### open62541
* https://www.open62541.org/
* https://github.com/open62541/open62541
## C#
### OPC Foundation
* https://opcfoundation.org/
* https://github.com/OPCFoundation/UA-.NETStandard-Samples

## Python Server
```
python3 -m pip install --upgrade pip setuptools==70.0.0 importlib_metadata
python3 -m pip install -r requirements.txt
```

## Next.js Client

<img src="./docs/screenshots/video_2025_04_11_1.gif" width="640">
```
npm install @emotion/cache @emotion/react @emotion/styled @mui/material @mui/icons-material socket.io-client
npm install socket.io socket.io-client @types/socket.io @types/socket.io-client node-opcua
npm install @emotion/server
```
```
npm run dev
```

## Node.js Client
```
npm install
npm run dev
```
<img src="./docs/screenshots/video_2025_04_11_0.gif" width="640">

## Run Full Test
```
cd python3
python3 ./server.py --port 4840
```

```
cd python3
python3 ./server.py --port 4841
```

```
cd python3
python3 ./server.py --port 4842
```

```
npm run dev
```