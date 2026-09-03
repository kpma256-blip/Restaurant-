import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Receive from "./pages/Receive";
import ReceivingHistory from "./pages/ReceivingHistory";
import ReceivingDetail from "./pages/ReceivingDetail";
import Waste from "./pages/Waste";
import Sales from "./pages/Sales";
import Counts from "./pages/Counts";
import CountDetail from "./pages/CountDetail";
import Recipes from "./pages/Recipes";
import MenuItemDetail from "./pages/MenuItemDetail";
import Suppliers from "./pages/Suppliers";
import History from "./pages/History";
import Reports from "./pages/Reports";
import ToastIntegration from "./pages/ToastIntegration";
import ToastMapping from "./pages/ToastMapping";
import Settings from "./pages/Settings";
import Users from "./pages/Users";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/receive" element={<Receive />} />
        <Route path="/receiving" element={<ReceivingHistory />} />
        <Route path="/receiving/:id" element={<ReceivingDetail />} />
        <Route path="/waste" element={<Waste />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/counts" element={<Counts />} />
        <Route path="/counts/:id" element={<CountDetail />} />
        {/* Menu Items and Recipes are the same underlying screen — a MenuItem
            and its Recipe are 1:1 in the data model, so there's nothing a
            second, separate CRUD flow would add beyond a different label. */}
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/menu-items" element={<Recipes />} />
        <Route path="/recipes/:id" element={<MenuItemDetail />} />
        <Route path="/menu-items/:id" element={<MenuItemDetail />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/history" element={<History />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/toast" element={<ToastIntegration />} />
        <Route path="/toast/mapping" element={<ToastMapping />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/users" element={<Users />} />
      </Route>
    </Routes>
  );
}
