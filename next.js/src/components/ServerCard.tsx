import React, { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Box, Chip, Paper } from '@mui/material';
import { useSocket } from '../contexts/SocketContext';

interface ServerData {
  temperature: number;
  pressure: number;
  status: string;
  timestamp: string;
}

interface ConnectionStatus {
  status: string;
  message: string;
  port: number;
}

interface ServerCardProps {
  serverName: string;
  port: number;
}

export const ServerCard: React.FC<ServerCardProps> = ({ serverName, port }) => {
  const { socket } = useSocket();
  const [data, setData] = useState<ServerData>({
    temperature: 0,
    pressure: 0,
    status: '--',
    timestamp: '--'
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'initializing',
    message: 'Initializing...',
    port: port
  });

  useEffect(() => {
    if (!socket) return;

    // Request initial connection status
    socket.emit('request-connection-status');

    const handleData = (newData: ServerData & { serverId: number }) => {
      if (newData.serverId === port) {
        setData({
          temperature: newData.temperature,
          pressure: newData.pressure,
          status: newData.status,
          timestamp: new Date(newData.timestamp).toLocaleTimeString()
        });
      }
    };

    const handleConnectionStatus = (states: Record<number, ConnectionStatus>) => {
      if (states[port]) {
        setConnectionStatus(states[port]);
      }
    };

    const handleServerStatus = (status: ConnectionStatus) => {
      if (status.port === port) {
        setConnectionStatus(status);
      }
    };

    // Listen for events
    socket.on('opcua-data', handleData);
    socket.on('all-connection-status', handleConnectionStatus);
    socket.on('server-connection-status', handleServerStatus);

    // Cleanup
    return () => {
      socket.off('opcua-data', handleData);
      socket.off('all-connection-status', handleConnectionStatus);
      socket.off('server-connection-status', handleServerStatus);
    };
  }, [socket, port]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'connected':
        return 'success';
      case 'connecting':
        return 'warning';
      case 'disconnected':
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusBgColor = (theme: any) => {
    const status = connectionStatus.status.toLowerCase();
    if (status === 'connected') return theme.palette.success.light;
    if (status === 'connecting') return theme.palette.warning.light;
    if (status === 'disconnected' || status === 'error') return theme.palette.error.light;
    return theme.palette.grey[300];
  };

  return (
    <Card
      sx={{
        height: '100%',
        width: 380,
        minWidth: 380,
        maxWidth: 380,
        margin: '0 auto'
      }}
      elevation={8}
    >
      <CardContent sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 3
      }}>
        <Typography variant="h5" gutterBottom sx={{
          borderBottom: '2px solid #eee',
          pb: 1,
          mb: 2
        }}>
          {serverName} (Port {port})
        </Typography>

        <Paper
          sx={{
            p: 2,
            mb: 3,
            bgcolor: getStatusBgColor,
            width: '100%',
            height: 120,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start'
          }}
          elevation={2}
        >
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Connection Status: {connectionStatus.status.charAt(0).toUpperCase() + connectionStatus.status.slice(1)}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              wordBreak: 'break-word',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical'
            }}
          >
            {connectionStatus.message}
          </Typography>
        </Paper>

        <Box sx={{ mb: 3, width: '100%' }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Temperature
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 'medium' }}>
            {data.temperature.toFixed(1)}°C
          </Typography>
        </Box>

        <Box sx={{ mb: 3, width: '100%' }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Pressure
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 'medium' }}>
            {data.pressure.toFixed(2)} bar
          </Typography>
        </Box>

        <Box sx={{ mb: 3, width: '100%' }}>
          <Typography variant="h6" gutterBottom color="text.secondary">
            Status
          </Typography>
          <Chip
            label={data.status}
            color={data.status === 'Running' ? 'success' : 'error'}
            sx={{
              fontSize: '1.2rem',
              padding: '24px 16px',
              width: '100%',
              height: 'auto',
              '& .MuiChip-label': {
                padding: '0'
              }
            }}
          />
        </Box>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 'auto',
            pt: 2,
            borderTop: '1px solid #eee',
            width: '100%',
            textAlign: 'right'
          }}
        >
          Last update: {data.timestamp}
        </Typography>
      </CardContent>
    </Card>
  );
};