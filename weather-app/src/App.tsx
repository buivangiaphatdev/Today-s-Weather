
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/layout';
import { ThemeProvider } from './context/theme-provider';
import WeatherDashboard from './pages/WeatherDashboard';
import CityPage from './pages/CityPage';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient(
  {
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 10*60*1000,
        retry:false,
        refetchOnWindowFocus: false,
      },
    },
  }
);
function App() {
  return (
    <QueryClientProvider client={queryClient}>

    <BrowserRouter>
      <ThemeProvider defaultTheme='dark'>
        <Layout>
          <Routes>
            <Route path='/' element={<WeatherDashboard/>}/>
            <Route path='/city/:cityName' element={<CityPage/>}/>

          </Routes>
        </Layout>
      </ThemeProvider>
    </BrowserRouter>
    <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}

export default App