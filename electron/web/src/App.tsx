import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import PickerView from './views/PickerView'
import ManagerView from './views/ManagerView'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<PickerView />} />
          <Route path="/manager/:appId" element={<ManagerView />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
