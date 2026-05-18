import './assets/main.css'
import Splitter from './components/Splitter/Splitter'
import PaneSelector from './components/PaneSelector/PaneSelector'
import { LapDataProvider } from './contexts/LapDataContext'

function App(): React.JSX.Element {
  return (
    <LapDataProvider>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <Splitter
          orientation="vertical"
          initialSize={50}
          firstChild={
            <Splitter
              orientation="horizontal"
              initialSize={50}
              firstChild={<PaneSelector defaultComponent="trackmap" />}
              secondChild={<PaneSelector defaultComponent="throttle" />}
            />
          }
          secondChild={
            <Splitter
              orientation="horizontal"
              initialSize={50}
              firstChild={<PaneSelector defaultComponent="brake" />}
              secondChild={<PaneSelector defaultComponent="empty" />}
            />
          }
        />
      </div>
    </LapDataProvider>
  )
}

export default App
