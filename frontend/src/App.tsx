import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Receive from "./pages/Receive";
import Waste from "./pages/Waste";
import Sales from "./pages/Sales";
import Counts from "./pages/Counts";
import CountDetail from "./pages/CountDetail";
import Recipes from "./pages/Recipes";
import MenuItemDetail from "./pages/MenuItemDetail";
import History from "./pages/History";
import Reports from "./pages/Reports";
import ToastIntegration from "./pages/ToastIntegration";
import ToastMapping from "./pages/ToastMapping";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/receive" element={<Receive />} />
        <Route path="/waste" element={<Waste />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/counts" element={<Counts />} />
        <Route path="/counts/:id" element={<CountDetail />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/:id" element={<MenuItemDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/toast" element={<ToastIntegration />} />
        <Route path="/toast/mapping" element={<ToastMapping />} />
      </Route>
    </Routes>
  );
}
