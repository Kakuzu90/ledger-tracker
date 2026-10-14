import { Outlet } from 'react-router-dom'
import { TabBar } from './TabBar'

/** Top-level tab screens: Home · Activity · (+) · Loans · Reports. */
export function TabLayout() {
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  )
}
