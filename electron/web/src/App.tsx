import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import PickerView from './views/PickerView'
import ManagerView from './views/ManagerView'
import { Toaster } from './components/ui/toaster'
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext'

export default function App() {
  return (
    <BrowserRouter>
      <UnsavedChangesProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<PickerView />} />
            <Route path="/manager/:appId" element={<ManagerView />} />
          </Routes>
        </Layout>
      </UnsavedChangesProvider>
      <Toaster />
    </BrowserRouter>
  )
}
