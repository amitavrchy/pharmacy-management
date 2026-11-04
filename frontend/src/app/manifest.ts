import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Medora Pharmacy Workspace",
    short_name: "Medora",
    description: "Pharmacy POS, inventory and prescriptions",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8f7",
    theme_color: "#137b5c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
