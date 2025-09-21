import { useState, useEffect } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface PriceSparklineProps {
  itemId: string;
  itemName: string;
  storeId?: string;
  storeName?: string;
  currentPrice?: number;
  days?: number;
  className?: string;
}

interface PricePoint {
  date: string;
  price: number;
  capturedAt: string;
}

export default function PriceSparkline({ 
  itemId, 
  itemName, 
  storeId, 
  storeName, 
  currentPrice,
  days = 30,
  className = ""
}: PriceSparklineProps) {
  const { data: priceHistory, isLoading } = useQuery({
    queryKey: ['/api/prices/history', itemId, storeId, days],
    queryFn: async () => {
      const url = storeId 
        ? `/api/prices/history/${itemId}?storeId=${storeId}&days=${days}`
        : `/api/prices/history/${itemId}?days=${days}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch price history');
      return response.json();
    },
    enabled: !!itemId
  });

  const sparklineData: PricePoint[] = priceHistory?.map((price: any) => ({
    date: new Date(price.capturedAt).toLocaleDateString(),
    price: parseFloat(price.price),
    capturedAt: price.capturedAt
  })) || [];

  const getTrend = () => {
    if (sparklineData.length < 2) return null;
    
    const firstPrice = sparklineData[0].price;
    const lastPrice = sparklineData[sparklineData.length - 1].price;
    const change = lastPrice - firstPrice;
    const percentChange = (change / firstPrice) * 100;
    
    return {
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
      change: Math.abs(change),
      percentChange: Math.abs(percentChange)
    };
  };

  const trend = getTrend();
  const hasData = sparklineData.length > 0;

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="w-16 h-8 bg-muted rounded animate-pulse"></div>
        <div className="w-12 h-4 bg-muted rounded animate-pulse"></div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className={`flex items-center space-x-2 text-muted-foreground text-xs ${className}`}>
        <div className="w-16 h-8 bg-muted rounded flex items-center justify-center">
          <span className="text-xs">No data</span>
        </div>
      </div>
    );
  }

  const minPrice = Math.min(...sparklineData.map(d => d.price));
  const maxPrice = Math.max(...sparklineData.map(d => d.price));
  const latestPrice = sparklineData[sparklineData.length - 1]?.price || currentPrice;

  return (
    <div className={`flex items-center space-x-2 ${className}`} data-testid={`price-sparkline-${itemId}`}>
      {/* Sparkline Chart */}
      <div className="w-16 h-8">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparklineData}>
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke={trend?.direction === 'up' ? '#ef4444' : trend?.direction === 'down' ? '#22c55e' : '#6b7280'}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 2, stroke: 'currentColor', strokeWidth: 1 }}
            />
            <Tooltip 
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-popover border border-border rounded px-2 py-1 shadow-md">
                      <p className="text-xs font-medium">${Number(payload[0].value).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {storeName && <p className="text-xs text-muted-foreground">{storeName}</p>}
                    </div>
                  );
                }
                return null;
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Price Info */}
      <div className="flex flex-col items-start">
        <div className="flex items-center space-x-1">
          <span className="text-sm font-medium" data-testid={`current-price-${itemId}`}>
            ${latestPrice?.toFixed(2)}
          </span>
          {trend && (
            <div className="flex items-center">
              {trend.direction === 'up' && <TrendingUp size={12} className="text-red-500" />}
              {trend.direction === 'down' && <TrendingDown size={12} className="text-green-500" />}
              {trend.direction === 'stable' && <Minus size={12} className="text-gray-500" />}
            </div>
          )}
        </div>
        
        {trend && trend.change > 0.01 && (
          <Badge 
            variant={trend.direction === 'up' ? 'destructive' : 'default'}
            className="text-xs px-1 py-0 h-4"
            data-testid={`trend-badge-${itemId}`}
          >
            {trend.direction === 'up' ? '+' : '-'}${trend.change.toFixed(2)}
          </Badge>
        )}
      </div>

      {/* Price Range */}
      <div className="text-xs text-muted-foreground">
        <div>H: ${maxPrice.toFixed(2)}</div>
        <div>L: ${minPrice.toFixed(2)}</div>
      </div>
    </div>
  );
}