"""Inventory management module for ScouterBot.

Provides helpers for the backend to:
- Calculate ordering recommendations
- Format inventory queries for the LLM
- Track order history patterns
"""

import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# Default inventory categories for new troops
DEFAULT_CATEGORIES = {
    "advancements": {
        "name": "Advancements",
        "items": [
            {"name": "Scout Rank Patch", "min_stock": 3, "unit": "each"},
            {"name": "Tenderfoot Rank Patch", "min_stock": 3, "unit": "each"},
            {"name": "Second Class Rank Patch", "min_stock": 3, "unit": "each"},
            {"name": "First Class Rank Patch", "min_stock": 3, "unit": "each"},
            {"name": "Star Rank Patch", "min_stock": 2, "unit": "each"},
            {"name": "Life Rank Patch", "min_stock": 2, "unit": "each"},
            {"name": "Eagle Rank Patch", "min_stock": 1, "unit": "each"},
        ]
    },
    "awards": {
        "name": "Awards",
        "items": [
            {"name": "Scout Spirit Award", "min_stock": 5, "unit": "each"},
            {"name": "Service Star Pins", "min_stock": 10, "unit": "each"},
            {"name": "Eagle Scout Certificate", "min_stock": 1, "unit": "each"},
            {"name": "Court of Honor Program", "min_stock": 25, "unit": "each"},
        ]
    },
    "uniforms": {
        "name": "Uniforms",
        "items": [
            {"name": "Troop Neckerchief", "min_stock": 5, "unit": "each"},
            {"name": "Troop Patch", "min_stock": 5, "unit": "each"},
            {"name": "Council Patch", "min_stock": 5, "unit": "each"},
        ]
    },
    "equipment": {
        "name": "Equipment",
        "items": [
            {"name": "First Aid Kit Refill", "min_stock": 2, "unit": "kit"},
            {"name": "Propane Fuel (16oz)", "min_stock": 6, "unit": "canister"},
            {"name": "Duct Tape Roll", "min_stock": 3, "unit": "roll"},
        ]
    }
}


class InventoryManager:
    """Manages inventory calculations and recommendations."""

    def __init__(self):
        self.order_history: List[Dict] = []

    def calculate_need(self, item: Dict, approaching_count: int = 0) -> Dict:
        """Calculate how many of an item are needed.

        Args:
            item: Inventory item dict with on_hand, on_order, min_stock
            approaching_count: Number of Scouts approaching this advancement

        Returns:
            Dict with recommended, needed, and status info
        """
        on_hand = item.get("on_hand", 0)
        on_order = item.get("on_order", 0)
        min_stock = item.get("min_stock", 0)
        total_available = on_hand + on_order

        # Base need: minimum stock level
        base_needed = max(min_stock - total_available, 0)

        # Add approaching scouts
        scouts_needed = max(approaching_count - total_available, 0)

        # Recommended is the max of both
        recommended = max(base_needed, scouts_needed)

        status = "ok"
        if on_hand == 0 and on_order == 0:
            status = "out"
        elif recommended > 0:
            status = "low"

        return {
            "item_id": item.get("id", ""),
            "item_name": item.get("name", ""),
            "on_hand": on_hand,
            "on_order": on_order,
            "min_stock": min_stock,
            "approaching": approaching_count,
            "base_needed": base_needed,
            "scouts_needed": scouts_needed,
            "recommended": recommended,
            "status": status,
            "unit": item.get("unit", "each"),
        }

    def format_inventory_for_llm(self, inventory_data: Dict) -> str:
        """Format inventory data as context for the LLM."""
        items = inventory_data.get("items", [])
        troop = inventory_data.get("troop_number", "Unknown")

        if not items:
            return f"Troop {troop} has no inventory items recorded yet."

        lines = [f"Troop {troop} Inventory (last updated {inventory_data.get('last_updated', 'unknown')}):"]
        lines.append("")

        # Group by category
        by_category: Dict[str, List[Dict]] = {}
        for item in items:
            cat = item.get("category", "Other")
            by_category.setdefault(cat, []).append(item)

        for category, cat_items in sorted(by_category.items()):
            lines.append(f"**{category.title()}:**")
            for item in cat_items:
                total = item.get("on_hand", 0) + item.get("on_order", 0)
                min_s = item.get("min_stock", 0)
                need = max(min_s - total, 0)
                status_emoji = "🟢" if need == 0 else "🟡" if total > 0 else "🔴"
                lines.append(
                    f"  {status_emoji} {item['name']}: "
                    f"{item.get('on_hand', 0)} on hand + "
                    f"{item.get('on_order', 0)} on order "
                    f"(min: {min_s}, need: {need})"
                )
            lines.append("")

        return "\n".join(lines)

    def format_order_recommendation(self, item: Dict, approaching: int = 0) -> str:
        """Generate a human-readable order recommendation."""
        calc = self.calculate_need(item, approaching)

        if calc["recommended"] <= 0:
            return (
                f"✅ **{calc['item_name']}**: Stock is good! "
                f"You have {calc['on_hand']} on hand + {calc['on_order']} on order "
                f"(minimum: {calc['min_stock']}). No order needed right now."
            )

        parts = [
            f"🛒 **{calc['item_name']}**: Recommended order: **{calc['recommended']}** {calc['unit']}",
            "",
            "**Calculation:**",
            f"• On hand: {calc['on_hand']}",
            f"• On order: {calc['on_order']}",
            f"• Minimum stock: {calc['min_stock']}",
        ]

        if approaching > 0:
            parts.append(f"• Scouts approaching: {approaching}")

        parts.append(f"• **Recommended order: {calc['recommended']}**")
        parts.append("")
        parts.append(
            "You can accept this recommendation or override it if you want to order "
            "more for just-in-case (e.g., mid-year crossovers, bulk discount)."
        )

        return "\n".join(parts)

    def get_low_stock_items(self, inventory_data: Dict) -> List[Dict]:
        """Get all items that need ordering."""
        items = inventory_data.get("items", [])
        low = []
        for item in items:
            calc = self.calculate_need(item)
            if calc["recommended"] > 0:
                low.append(calc)
        return low

    def create_inventory_template(self, troop_number: str = "") -> Dict:
        """Create a fresh inventory JSON template."""
        items = []
        for cat_key, cat_data in DEFAULT_CATEGORIES.items():
            for template in cat_data["items"]:
                items.append({
                    "id": f"{cat_key}_{template['name'].lower().replace(' ', '_').replace('/', '_')}",
                    "name": template["name"],
                    "category": cat_key,
                    "on_hand": 0,
                    "on_order": 0,
                    "min_stock": template["min_stock"],
                    "unit": template["unit"],
                    "sku": "",
                    "notes": "",
                })

        return {
            "troop_number": troop_number,
            "last_updated": datetime.utcnow().isoformat() + "Z",
            "items": items,
            "pending_orders": [],
        }


# Singleton instance
inventory_manager = InventoryManager()

