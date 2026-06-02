'use client';

import { MapPin, ExternalLink, ArrowRight } from 'lucide-react';

interface Props {
  origin: string;
  destination: string;
  mapUrl: string;
}

// 接駁路線地圖:直接內嵌 OpenStreetMap 小地圖在頁面上(不需點擊跳頁)。
// 路線固定:新竹市東區力行路11號 → 苗栗縣竹南鎮大厝里國泰路20號。
// 地圖 bbox 同時涵蓋兩端,marker 標在起點(上車處)。
const OSM_EMBED =
  'https://www.openstreetmap.org/export/embed.html?bbox=120.85%2C24.66%2C121.02%2C24.80&layer=mapnik&marker=24.7846%2C120.9971';

export default function RouteMap({ origin, destination, mapUrl }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-teal-800 text-sm flex items-center gap-1.5">
          <MapPin className="w-4 h-4" /> 接駁路線
        </h3>
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium"
        >
          <ExternalLink className="w-3.5 h-3.5" /> 完整路線
        </a>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-medium text-gray-700 bg-teal-50/60 rounded-xl py-2.5 mb-3">
        <span className="bg-white px-2.5 py-1 rounded-lg shadow-sm border border-teal-100">{origin}</span>
        <ArrowRight className="w-4 h-4 text-teal-500 shrink-0" />
        <span className="bg-white px-2.5 py-1 rounded-lg shadow-sm border border-teal-100">{destination}</span>
      </div>

      {/* 內嵌 OpenStreetMap 小地圖 */}
      <div className="rounded-xl overflow-hidden border border-teal-100 bg-teal-50">
        <iframe
          title="接駁路線地圖"
          className="w-full h-44 block"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={OSM_EMBED}
        />
      </div>
    </div>
  );
}
