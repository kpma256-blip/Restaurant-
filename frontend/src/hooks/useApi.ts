import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

type QueryOptions<T> = any;
type MutationOptions<T> = any;

// Products
export function useProducts(options?: QueryOptions<any[]>) {
  return useQuery<any[]>({
    queryKey: ["products"],
    queryFn: async () => api.get("/products"),
    ...options,
  });
}

export function useProduct(id: string, options?: QueryOptions<any>) {
  return useQuery<any>({
    queryKey: ["products", id],
    queryFn: async () => api.get(`/products/${id}`),
    enabled: !!id,
    ...options,
  });
}

export function useCreateProduct(options?: MutationOptions<any>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post("/products", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    ...options,
  });
}

// Units
export function useUnits(active?: boolean, options?: QueryOptions<any[]>) {
  return useQuery<any[]>({
    queryKey: ["units", active],
    queryFn: async () => api.get(`/units${active ? "?active=true" : ""}`),
    ...options,
  });
}

export function useCreateUnit(options?: MutationOptions<any>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post("/units", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["units"] }),
    ...options,
  });
}

// Categories
export function useCategories(options?: QueryOptions<any[]>) {
  return useQuery<any[]>({
    queryKey: ["categories"],
    queryFn: async () => api.get("/categories"),
    ...options,
  });
}

export function useCategoriesWithTypes(options?: QueryOptions<any[]>) {
  return useQuery<any[]>({
    queryKey: ["categories-with-types"],
    queryFn: async () => api.get("/categories?includeTypes=true"),
    ...options,
  });
}

// ProductTypes
export function useProductTypes(options?: QueryOptions<any[]>) {
  return useQuery<any[]>({
    queryKey: ["product-types"],
    queryFn: async () => api.get("/product-types"),
    ...options,
  });
}

export function useProductTypesByCategory(categoryId: string | null, options?: QueryOptions<any[]>) {
  return useQuery<any[]>({
    queryKey: ["product-types", categoryId],
    queryFn: async () => api.get(`/product-types?categoryId=${categoryId}`),
    enabled: !!categoryId,
    ...options,
  });
}

export function useCreateProductType(options?: MutationOptions<any>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post("/product-types", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-types"] });
      qc.invalidateQueries({ queryKey: ["categories-with-types"] });
    },
    ...options,
  });
}

// Waste
export function useWasteRecords(options?: QueryOptions<any[]>) {
  return useQuery<any[]>({
    queryKey: ["waste"],
    queryFn: async () => api.get("/inventory/waste"),
    ...options,
  });
}

export function useCreateWaste(options?: MutationOptions<any>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post("/inventory/waste", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["waste"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    ...options,
  });
}

// Inventory Adjustment
export function useAdjustInventory(options?: MutationOptions<any>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post("/inventory/adjust", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    ...options,
  });
}

// Suppliers
export function useSuppliers(options?: QueryOptions<any[]>) {
  return useQuery<any[]>({
    queryKey: ["suppliers"],
    queryFn: async () => api.get("/suppliers"),
    ...options,
  });
}

// Dashboard
export function useDashboard(options?: QueryOptions<any>) {
  return useQuery<any>({
    queryKey: ["dashboard"],
    queryFn: async () => api.get("/dashboard"),
    refetchInterval: 60000,
    ...options,
  });
}

// Alerts
export function useAlerts(options?: QueryOptions<any[]>) {
  return useQuery<any[]>({
    queryKey: ["alerts"],
    queryFn: async () => api.get("/alerts"),
    refetchInterval: 60000,
    ...options,
  });
}
