import { Container, Grid, Typography, ThemeProvider, createTheme, CssBaseline, Box } from '@mui/material';
import { ServerCard } from '../components/ServerCard';
import { SocketProvider } from '../contexts/SocketContext';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

const servers = [
  { name: 'Server 1', port: 4840 },
  { name: 'Server 2', port: 4841 },
  { name: 'Server 3', port: 4842 },
];

export default function Dashboard() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SocketProvider>
        <Container maxWidth="xl" sx={{ py: 4 }}>
          <Typography
            variant="h2"
            component="h1"
            gutterBottom
            align="center"
            sx={{ mb: 6 }}
          >
            OPC-UA Client Dashboard
          </Typography>

          <Box sx={{
            maxWidth: 1200,
            mx: 'auto',
            px: 2,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 4,
            justifyItems: 'center'
          }}>
            {servers.map((server) => (
              <Box key={server.port}>
                <ServerCard serverName={server.name} port={server.port} />
              </Box>
            ))}
          </Box>
        </Container>
      </SocketProvider>
    </ThemeProvider>
  );
}