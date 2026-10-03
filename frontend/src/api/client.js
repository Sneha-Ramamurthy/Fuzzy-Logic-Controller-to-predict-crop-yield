import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

const client = axios.create({ baseURL: API_BASE });

export const getCrops = () => client.get("/crops").then((r) => r.data.crops);

export const getCropConfig = (crop) =>
  client.get(`/crops/${encodeURIComponent(crop)}/config`).then((r) => r.data);

export const getCropRecords = (crop, params = {}) =>
  client.get(`/crops/${encodeURIComponent(crop)}/records`, { params }).then((r) => r.data.records);

export const getDistrictAverages = (crop) =>
  client.get(`/crops/${encodeURIComponent(crop)}/district-averages`).then((r) => r.data.districts);

export const predict = (crop, area_ha, rainfall_mm) =>
  client.post("/predict", { crop, area_ha, rainfall_mm }).then((r) => r.data);

export const getValidation = (crop) =>
  client.get(`/validation/${encodeURIComponent(crop)}`).then((r) => r.data);

export const getSimulatedHistory = (crop, limit = 30) =>
  client.get(`/simulated/${encodeURIComponent(crop)}`, { params: { limit } }).then((r) => r.data.readings);

export { API_BASE };
