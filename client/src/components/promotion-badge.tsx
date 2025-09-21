import { Badge } from "@/components/ui/badge";
import { Tag, Percent, Star } from "lucide-react";

interface PromotionBadgeProps {
  isPromotion: boolean;
  originalPrice?: string | null;
  promotionText?: string | null;
  memberPrice?: string | null;
  loyaltyRequired?: boolean | null;
  currentPrice: string;
  userHasMembership?: boolean;
}

export function PromotionBadge({
  isPromotion,
  originalPrice,
  promotionText,
  memberPrice,
  loyaltyRequired,
  currentPrice,
  userHasMembership = false
}: PromotionBadgeProps) {
  if (!isPromotion) return null;

  const savings = originalPrice && parseFloat(originalPrice) > 0 
    ? (parseFloat(originalPrice) - parseFloat(currentPrice)).toFixed(2) 
    : null;
  const savingsPercent = originalPrice && parseFloat(originalPrice) > 0 
    ? Math.round(((parseFloat(originalPrice) - parseFloat(currentPrice)) / parseFloat(originalPrice)) * 100) 
    : null;
  
  // Determine promotion type based on text content (null-safe)
  const isMemberSpecial = (promotionText?.toLowerCase()?.includes('member') ?? false) || !!loyaltyRequired;
  const isRegularSale = !isMemberSpecial;
  
  // Don't show member-only promotions if user doesn't have membership
  if (isMemberSpecial && !userHasMembership) return null;

  return (
    <div className="flex flex-col gap-1" data-testid="promotion-badge">
      <div className="flex flex-wrap gap-1">
        {/* Main promotion badge */}
        {isRegularSale && (
          <Badge variant="destructive" className="bg-red-500 hover:bg-red-600 text-white">
            <Tag className="w-3 h-3 mr-1" />
            SALE
          </Badge>
        )}
        
        {isMemberSpecial && (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300">
            <Star className="w-3 h-3 mr-1" />
            Member Special
          </Badge>
        )}

        {/* Savings amount */}
        {savings && (
          <Badge 
            variant="outline" 
            className={isMemberSpecial 
              ? "border-yellow-500 text-yellow-700" 
              : "border-red-500 text-red-600"
            }
          >
            <Percent className="w-3 h-3 mr-1" />
            Save ${savings}
          </Badge>
        )}

        {/* Savings percentage */}
        {savingsPercent && (
          <Badge 
            variant="outline" 
            className={isMemberSpecial 
              ? "border-yellow-500 text-yellow-700" 
              : "border-red-500 text-red-600"
            }
          >
            {savingsPercent}% OFF
          </Badge>
        )}
      </div>

      {/* Promotion text */}
      {promotionText && (
        <p 
          className={`text-xs font-medium ${isMemberSpecial ? 'text-yellow-700' : 'text-red-600'}`} 
          data-testid="promotion-text"
        >
          {promotionText}
        </p>
      )}

      {/* Price comparison */}
      <div className="flex items-center gap-2 text-xs">
        {originalPrice && (
          <span className="line-through text-gray-500" data-testid="original-price">
            ${originalPrice}
          </span>
        )}
        <span 
          className={`font-bold ${isMemberSpecial ? 'text-yellow-700' : 'text-red-600'}`} 
          data-testid="sale-price"
        >
          ${currentPrice}
        </span>
        {memberPrice && memberPrice !== currentPrice && userHasMembership && (
          <span className="text-yellow-600 font-medium" data-testid="member-price">
            Member: ${memberPrice}
          </span>
        )}
      </div>
    </div>
  );
}