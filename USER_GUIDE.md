# VendorTrack -- End-User Guide

**Version:** 1.0
**Audience:** Buyers and Sellers on the VendorTrack multi-vendor marketplace
**Last Updated:** 2026-03-05

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Buyer Workflow](#2-buyer-workflow)
3. [Seller Workflow](#3-seller-workflow)
4. [Marketplace Features](#4-marketplace-features)
5. [Checkout and Payments](#5-checkout-and-payments)
6. [Orders](#6-orders)
7. [Chat](#7-chat)
8. [Notifications](#8-notifications)
9. [Account Management](#9-account-management)
10. [FAQ](#10-faq)

---

## 1. Getting Started

### 1.1 Creating an Account

To use VendorTrack, you must first create an account. The registration process collects your basic information and assigns you a role that determines your experience on the platform. Navigate to the signup page by clicking the "Sign up" link on the login screen, or go directly to `/signup`.

The signup form requires the following fields:

| Field | Requirements |
|-------|-------------|
| Full Name | At least one character. This name appears on your profile and order records. |
| Email | Must be a valid email address. Used for login and order receipts. |
| Role | Select either "Buyer" or "Seller." This choice is permanent. |
| Password | Minimum of six characters. |
| Confirm Password | Must match the password field exactly. |

After submitting the form, VendorTrack creates your account using Supabase authentication. Your profile record is initialized with the role you selected. If any validation error occurs (such as a duplicate email or mismatched passwords), the form displays an inline error message describing the problem.

### 1.2 Choosing Your Role

During registration, you must select one of two roles:

- **Buyer**: Intended for customers who want to browse, purchase, and track products. Buyers access the marketplace, build a cart, complete checkout, and manage their order history. The buyer experience is centered around discovery, purchasing, and post-purchase management including refunds and order chat.

- **Seller**: Intended for vendors who want to list and sell products. Sellers access a dedicated dashboard for managing products, fulfilling orders, and tracking revenue. The seller experience includes product creation, order status management, and store configuration.

**Important**: Your role is set at the time of registration and cannot be changed later. If you need both buyer and seller capabilities, you must create two separate accounts with different email addresses. This restriction exists to maintain clear audit trails and ensure that financial transactions are correctly attributed to the appropriate party.

### 1.3 Logging In

To log in, navigate to `/login` and enter your registered email and password. The system authenticates your credentials through Supabase Auth. Upon successful login, you are automatically redirected based on your role:

| Role | Redirect Destination |
|------|---------------------|
| Buyer | `/buyer-orders` (your transactional ledger) |
| Seller | `/seller-dashboard` (your store overview) |

If your credentials are invalid, an error message appears. If you have forgotten your password, use the password reset functionality provided by the authentication system.

### 1.4 Navigating the Marketplace

After logging in, the platform provides a consistent navigation layout tailored to your role. The authenticated layout includes a sidebar or bottom navigation bar (depending on your device) with links to the sections relevant to your role. Buyers see links to the marketplace, cart, and order history. Sellers see links to the dashboard, products, orders, and settings. The navigation is responsive and adapts to mobile and desktop viewports.

---

## 2. Buyer Workflow

### 2.1 Browsing the Marketplace

The marketplace is the primary product discovery interface, accessible at `/products` (the `/marketplace` route automatically redirects here). The page displays a grid of active product listings, each showing a product image, title, price, and stock availability. Products are arranged in a responsive grid that adapts from one column on mobile to four columns on wide screens.

The product grid is server-rendered for fast initial load times, with skeleton loading states shown while data is being fetched. Each product card links to the product detail page. If no products are available, a message indicates that the catalog is empty.

### 2.2 Searching for Products

The marketplace page includes a search bar at the top. As you type, the system provides search suggestions based on product titles that match your query prefix. Suggestions are cached for performance and appear after you have typed at least two characters. To execute a full search, press Enter or submit the search form.

**Filters** are accessible via the filter button (sliders icon) next to the search bar. Clicking it opens a side panel where you can set:

| Filter | Description |
|--------|-------------|
| Min Price | The lowest price (in dollars) to include in results |
| Max Price | The highest price (in dollars) to include in results |

**Category filters** appear as badges below the search bar. Clicking a category badge filters the product listing to only show products in that category. The "All" badge removes the category filter. Categories are dynamically loaded from the product catalog and cached for performance.

The search service supports full-text search with result ranking, pagination, and price range filtering. Results are cached in Redis to provide fast subsequent loads for common queries.

### 2.3 Viewing Product Details

Clicking any product card takes you to the product detail page at `/products/[id]`. This page provides comprehensive information about the product, including:

- **Product image**: A high-resolution image displayed in a card with a 1:1 aspect ratio. The image loads with priority on the initial viewport for performance.
- **Category badge**: A secondary badge showing the product's category (or "Standard" if uncategorized).
- **Title**: The full product name in large, bold text.
- **Price**: Displayed in a prominent format with currency formatting.
- **Description**: The full product specifications and description, rendered with whitespace preservation.
- **Vendor information**: A card linking to the seller's store profile, showing the store name with a verification badge. Clicking this navigates to the seller's public storefront at `/store/[sellerId]`.
- **Trust indicators**: Three icons below the product image indicate "Secure Pay," "Tracked," and "Refundable" to reinforce buyer confidence.
- **Add to Cart button**: A full-width button labeled "Add to Order Ledger" that adds the product to your shopping cart.

The product detail page uses parallel data fetching to load the product and seller profile simultaneously, reducing perceived load time. A skeleton loading state is displayed while data is being fetched.

### 2.4 Adding Items to Cart

When you click the "Add to Order Ledger" button on a product detail page, the item is added to your shopping cart. The cart is stored server-side and is associated with your account, so it persists across sessions and devices. Each cart item records the product, quantity, and the seller who owns the product.

### 2.5 Managing Your Cart

Navigate to `/cart` to view and manage your shopping cart. The cart page displays all items you have added, organized in a two-column layout on desktop (cart items on the left, order summary on the right) or a single column on mobile.

Each cart item shows:

- Product image (thumbnail)
- Product title
- Unit price
- Quantity controls (increase, decrease, or remove)
- Line total (unit price multiplied by quantity)

The **Order Summary** panel on the right shows:

| Field | Description |
|-------|-------------|
| Subtotal | Sum of all line totals |
| Shipping | Displayed as "Calculated at checkout" |
| Total | Equal to the subtotal (shipping added during checkout) |

The "Proceed to Checkout" button navigates to the checkout page.

If your cart is empty, the page displays a message with a link to start shopping at the marketplace.

### 2.6 Cart Actions

The cart supports two primary server actions:

**updateCartItem(cartItemId, quantity)**: Updates the quantity of a specific cart item. If the quantity is set to less than 1, the item is automatically removed from the cart. This action verifies that you own the cart item before making changes. If you attempt to modify a cart item that belongs to another user, the request is denied and the attempt is logged as a security event.

**removeCartItem(cartItemId)**: Removes a cart item entirely from your cart. Like the update action, this verifies ownership before deletion. Unauthorized removal attempts are denied and logged.

Both actions are server-side operations that require authentication and enforce ownership checks. The cart item controls component provides the user interface for these actions, with increment/decrement buttons and a remove option.

### 2.7 Checkout Process

The checkout page at `/checkout` is where you finalize your purchase. The page is divided into two main sections:

**Left Section -- Shipping and Payment**:
- **Shipping Address**: A Stripe Address Element form where you enter your shipping details (name, address, city, state, postal code, country).
- **Payment Method**: A Stripe Payment Element form that supports various payment methods including credit cards, debit cards, and other regional payment options enabled by Stripe.

**Right Section -- Order Summary and Trust Panel**:
- A summary of the items in your order, including product thumbnails, titles, quantities, and line totals.
- The subtotal, shipping estimate, and total.
- The "Complete Secure Payment" button that submits the payment.
- A trust panel showing three security guarantees: Stripe Secure (256-bit SSL), Buyer Protection (full refund for non-delivered items), and Data Privacy (PCI-DSS Level 1 compliance).

If your cart is empty when you navigate to checkout, you are automatically redirected to the marketplace.

### 2.8 Stripe Payment Integration

VendorTrack uses Stripe as its payment processor. When you click "Complete Secure Payment," the following occurs:

1. The Stripe Elements form collects your payment details securely within Stripe's iframe -- VendorTrack never sees or stores your raw card number.
2. Stripe creates a PaymentIntent and attempts to confirm the payment.
3. If the payment succeeds, you are redirected to `/buyer-orders?payment_success=true` where a confirmation toast appears.
4. If the payment fails, an error message is displayed on the checkout page.

The entire payment flow is secured by Stripe's PCI-DSS Level 1 compliance. Your card details are transmitted directly to Stripe and never pass through VendorTrack's servers.

### 2.9 Viewing Order History

Your order history is accessible at `/buyer-orders` (the `/buyer-dashboard` route redirects here). This page is titled "Transactional Ledger" and displays all your past and current orders in a data table with the following information:

- Order reference (truncated ID)
- Product name
- Amount
- Order status
- Date created
- Action buttons (chat, refund)

The order list is paginated, loading 10 orders at a time. A "Sync Previous Entries" button at the bottom loads the next page of results. If you have no orders, the page displays an empty state with a link to browse the marketplace.

When you arrive at this page after a successful payment (via the `payment_success=true` query parameter), a toast notification confirms that your payment has been captured and fulfillment is being tracked.

### 2.10 Requesting Refunds

If you need to request a refund for an order, click the refund button on the order row in your order history. This opens the Refund Request Modal, which requires you to provide a reason for the refund (minimum 10 characters). The modal includes a warning that refunds are subject to review.

When you submit the refund request:

1. The `requestRefund` server action is invoked with the order ID and your reason.
2. The system verifies that you own the order (you cannot request a refund on another buyer's order).
3. The order's refund status is updated to "requested" and an audit log entry is created.
4. The request is submitted for platform administrator review.
5. An administrator reviews the request and either approves or rejects it.

If the refund is approved, the system processes the refund through Stripe, and the funds are returned to your original payment method. If rejected, the refund status is updated to "rejected" and you are notified.

### 2.11 Order Chat with Sellers

From the buyer orders page, you can open a chat with the seller for any order. Click the chat button on the order row to open a side panel containing the Order Chat component. This allows you to communicate directly with the seller about the order, ask questions about shipping, report issues, or discuss the product.

---

## 3. Seller Workflow

### 3.1 Seller Onboarding

When you register as a seller, your account starts in a "pending" verification state. Before you can list products publicly, you must complete the following onboarding steps, which are tracked on the seller dashboard:

| Step | Description | How to Complete |
|------|-------------|-----------------|
| Connect Stripe Account | Authorize automated payouts through Stripe Connect | Navigate to `/seller-dashboard/settings` and complete the Stripe onboarding flow |
| Complete Store Profile | Add a store logo and description | Navigate to `/seller-dashboard/settings` and fill in the store details form |
| Create Your First Product | List your first inventory item | Navigate to `/seller-dashboard/products` and create a product |
| Publish Active Listing | Make a product visible to buyers | Change a product's status from "Draft" to "Active" |

The onboarding progress is displayed as a card on the seller dashboard with a progress bar and step-by-step checklist. Each incomplete step includes a link to the relevant settings page. Once all steps are complete, the progress card disappears.

### 3.2 Seller Approval Process

New seller accounts require administrator approval before products can be listed publicly. The approval process works as follows:

1. You register as a seller and your `seller_status` is set to "pending."
2. You complete the onboarding steps (Stripe connection, store profile, product creation).
3. An administrator reviews your account and either approves or rejects it.
4. Once approved, your `seller_status` changes to "approved" and you can publish products with "Active" status.

While your account is in "pending" status, you can still create products but they can only be saved as "Draft." The product form displays a visibility restriction alert explaining that Stripe connection and admin verification are required before products can be made public.

### 3.3 Accessing the Seller Dashboard

The seller dashboard at `/seller-dashboard` provides an overview of your store's performance. It includes:

**Stat Cards**:
| Metric | Description |
|--------|-------------|
| Total Earnings | Revenue from delivered orders |
| Active Orders | Orders currently requiring fulfillment |
| Fulfillment Rate | Percentage of orders delivered on time |
| Store Products | Total number of live and draft listings |

**Platform Governance Card**: Displays your current standing on the marketplace, including:
- Seller Verification status (approved or pending)
- Payment Method status (Stripe connected or missing)
- Marketplace Fee (10% per sale)

**Pro Tips Panel**: A dark-themed card with tips for improving your store performance, such as using the AI Copilot for descriptions and shipping items within 24 hours to improve your store reliability score.

### 3.4 Managing Products

Navigate to `/seller-dashboard/products` to manage your product listings. This page displays a data table of all your products with columns for title, category, price, status, and actions. You can create new products, edit existing ones, and delete products.

**Creating a Product**:

1. Click the "Add Product" button on the dashboard or products page.
2. Fill in the product form:
   - **Asset Visualization**: Upload a product image (accepted formats: any image type).
   - **Asset Name**: The product title.
   - **Specifications**: A detailed product description. You can use the AI Copywriter (see below).
   - **Category**: The product category.
   - **Unit Value (USD)**: The price in dollars. The system converts this to cents internally for precision.
   - **Market Status**: "Active (Public)" or "Draft (Internal)." Active status is only available if your Stripe account is connected and your seller status is approved.
3. Click "Commit Listing" to save the product.

**Editing a Product**: Click the edit action on a product row to open the same form pre-filled with the product's current data. Make your changes and click "Commit Listing" to save.

**Deleting a Product**: Click the delete action on a product row. The product is soft-deleted (marked with a `deleted_at` timestamp) rather than permanently removed, preserving data integrity for existing orders.

### 3.5 upsertProduct Server Action

The `upsertProduct` server action is the core mechanism for creating and updating products. It accepts a `productData` object and an optional `existingProductId`. If `existingProductId` is provided, the action updates the existing product; otherwise, it creates a new one. The action performs the following:

1. Verifies that the authenticated user has the `PRODUCTS_WRITE` permission and is a seller.
2. If updating, verifies that the seller owns the product (or is an admin).
3. If creating, associates the product with the authenticated seller.
4. Validates the input data using the `CreateProductSchema` or `UpdateProductSchema` DTOs.
5. Delegates to the inventory service for the actual database operation.

This server action ensures that only authorized sellers can create or modify products, and that all product data is validated before persistence.

### 3.6 AI Product Description Generation

VendorTrack includes an AI-powered product description generator that helps sellers create compelling product listings. The AI Copywriter is accessible from the product form via the "AI Copywriter" button next to the "Specifications" label.

**Using the AI Generator**:

1. Click "AI Copywriter" in the product form to open the generator modal.
2. Fill in the input fields:
   - **Product Name**: The name of your product (pre-filled if you have already entered a title).
   - **Category**: The product category.
   - **Key Features and Specs**: A list of the product's key features and specifications.
   - **Target Audience**: A description of who the product is for.
   - **Tone of Voice**: Select from Professional, Friendly, Luxury, Minimal, or Bold.
3. Click "Generate Description" to invoke the AI.
4. The AI generates four outputs:
   - **Optimized Title**: A refined product title.
   - **Short Description**: A concise product description.
   - **Benefit Bullet Points**: A list of key benefits.
   - **Closing Paragraph**: A persuasive closing statement.
5. You can copy any generated field to your clipboard using the copy button.
6. Click "Apply to Form" to populate the product form with the generated content.

The AI generation is powered by Google Genkit with Gemini 2.5 and uses structured Zod-output parsing for reliable results. If the generation fails, an error toast is displayed.

### 3.7 Managing Orders

Navigate to `/seller-dashboard/orders` to view and manage your incoming orders. This page displays a data table of all orders where you are the seller, including columns for order reference, buyer, product, amount, status, and actions.

The order list is paginated (10 orders per page) with a "Load Previous Records" button for pagination. Orders are sorted by creation date in descending order (newest first).

### 3.8 updateOrderStatus Server Action

The `updateOrderStatus` server action allows sellers to update the status and shipping details of an order. It accepts:

- `orderId`: The ID of the order to update.
- `updateData`: An object containing:
  - `status`: The new order status.
  - `tracking_number` (optional): The shipping tracking number.
  - `carrier` (optional): The shipping carrier name.

The action verifies that the authenticated user has the `ORDERS_MANAGE` permission and is a seller. It delegates to the inventory service for the actual database update, which verifies that the seller owns the order.

### 3.9 Order Fulfillment

To fulfill an order, click the edit action on an order row in the seller orders page. This opens the "Update Fulfillment Status" dialog:

1. **Select the new status**: The available status transitions depend on the current status:
   - From "pending": You can set to "pending" or "shipped."
   - From "shipped": You can set to "shipped" or "delivered."
   - From "delivered": No further changes are allowed.

2. **Enter shipping details** (when marking as shipped): When the status is set to "shipped," a "Shipping Intelligence" section appears with fields for:
   - **Carrier**: The shipping carrier (e.g., FedEx, UPS, DHL).
   - **Tracking Number**: The shipment tracking number.

3. Click "Commit Updates" to save the changes.

The buyer will be able to see the updated status and tracking information in their order history. Providing accurate tracking numbers helps reduce buyer inquiries and improves your store's reliability score.

### 3.10 Seller Settings

Navigate to `/seller-dashboard/settings` to configure your store. The settings page includes:

**Automated Payments Card**: Shows whether your Stripe Connect account is connected. If connected, a green confirmation message indicates that you are authorized to receive real-time payments minus the 10% platform fee. If not connected, an amber warning indicates that you must connect Stripe to enable public listings.

**Referral Program Card**: Displays your referral link, which you can copy to share with others. When someone signs up using your referral link, you receive credit.

**Store Details Form**:
- **Store Logo**: Upload an image file for your store logo. The image is stored in Supabase Storage.
- **Store Name**: The name of your store as it appears to buyers.
- **Description**: A description of your store.
- **Payout Email**: The email address associated with your payout account.

Click "Save Changes" to update your store settings. The store logo is uploaded to the `market-assets` bucket in Supabase Storage, and the public URL is saved to your profile.

### 3.11 Viewing Seller Profile

Your public storefront is accessible at `/store/[id]` (the `/sellers/[id]` route redirects here). Buyers can view this page by clicking the vendor link on a product detail page. The storefront displays:

- **Header Section**: A banner area with your store logo, store name, store description, location ("Remote Vendor"), and the date you joined the platform. A "Contact" button allows buyers to email you directly.
- **Store Performance Sidebar**: Shows quality and response time metrics.
- **Active Listings**: A grid of all your active products, each showing the product image, title, and price. Clicking a product navigates to the product detail page.

If the store profile is not found, a "Store Not Found" message is displayed with a link back to the marketplace.

---

## 4. Marketplace Features

### 4.1 Featured Products

The marketplace highlights featured products through a curated selection mechanism. Featured products are cached and retrieved using the `getCachedFeaturedProducts` function, which ensures that the most prominent listings load quickly and are displayed prominently in the product grid. The featured product selection is determined by the platform and is refreshed periodically to showcase new and popular items.

### 4.2 Product Categories

Products on VendorTrack are organized into categories. Categories are dynamically loaded from the product catalog using the `getCachedCategories` function, which caches the results for performance. Categories appear as filter badges on the marketplace page, allowing buyers to quickly narrow their search to a specific product type. The category system supports:

- **Category filtering**: Clicking a category badge filters the product listing to show only products in that category.
- **Category badges on product detail**: Each product detail page displays a category badge (or "Standard" if uncategorized).
- **Category in product forms**: Sellers specify a category when creating or editing a product.

### 4.3 Search with Suggestions

The VendorTrack search system provides an intelligent, autocomplete-style search experience. When you begin typing in the search bar, the system returns matching product titles as suggestions. The search functionality works as follows:

- **Prefix matching**: Suggestions are generated based on product titles that start with the characters you have typed (case-insensitive).
- **Minimum input**: Suggestions appear after you have typed at least two characters.
- **Caching**: Suggestions are cached in Redis to provide fast response times for common queries.
- **Full search**: Submitting the search form (by pressing Enter) executes a full-text search with support for query terms, category filtering, and price range filtering.
- **Result ranking**: Search results are ranked by relevance, with the most relevant products appearing first.

The search API endpoint at `/api/products/search` accepts query parameters including `q` (search term), `category`, `minPrice`, `maxPrice`, `page`, and `limit`. Results are cached with a configurable TTL to optimize performance for popular queries.

### 4.4 Product Details with Images

Each product listing includes a high-quality image displayed in a responsive format. Images are optimized using Next.js Image component with:

- **Responsive sizing**: The `sizes` attribute is configured to serve appropriately sized images based on the viewport width, reducing bandwidth usage on smaller screens.
- **Lazy loading**: Product grid images use lazy loading (`loading="lazy"`) to defer loading off-screen images until they are needed.
- **Priority loading**: The main product image on the detail page loads with priority to ensure the hero image is visible immediately.
- **Hover effects**: Product cards feature a subtle zoom effect on hover, providing visual feedback and enhancing the browsing experience.

All product images are stored in Supabase Storage and served with optimized URLs. The image upload process during product creation handles file validation and storage automatically.

---

## 5. Checkout and Payments

### 5.1 Stripe PaymentIntent Flow

VendorTrack uses the Stripe PaymentIntent flow for secure payment processing. The checkout process follows these steps:

1. **Cart Validation**: When you navigate to the checkout page, the system validates your cart items, verifies product availability, and checks that all sellers have active Stripe Connect accounts.
2. **PaymentIntent Creation**: The system calls the `POST /api/checkout/create-session` endpoint, which:
   - Authenticates your session.
   - Validates cart ownership.
   - Verifies each seller's Stripe Connect status.
   - Validates product availability (stock and status).
   - Calculates prices server-side (never trusting client-submitted prices).
   - Creates a payment session record with a pending status and expiration time.
   - Creates a Stripe PaymentIntent with destination charges (funds flow to the seller's connected account with a 10% platform application fee).
   - Creates a financial ledger entry for the payment creation.
   - Returns a `clientSecret` to the frontend.
3. **Payment Confirmation**: The frontend uses the Stripe Elements `confirmPayment` method to complete the payment. You are redirected to `/buyer-orders?payment_success=true` upon success.
4. **Webhook Processing**: Stripe sends a `payment_intent.succeeded` webhook to `/api/webhooks/stripe`, which:
   - Verifies the webhook signature.
   - Checks for replay attacks (events older than 5 minutes are rejected).
   - Implements exactly-once processing via an atomic `processed_events` table insert.
   - Verifies the session amount matches the PaymentIntent amount.
   - Calls the `fulfill_order_v2` database RPC, which atomically decrements inventory, creates the order, and records the payment completion.
   - Queues background jobs for notifications and analytics.

### 5.2 Payment Security

VendorTrack implements multiple layers of payment security:

| Security Measure | Description |
|-----------------|-------------|
| Server-side pricing | All prices are calculated from the database. Client-submitted prices are never trusted. |
| Webhook signature verification | Every Stripe webhook is verified to ensure it originated from Stripe. |
| Exactly-once processing | Duplicate webhooks are detected and safely ignored via the `processed_events` table. |
| Session locking | `SELECT FOR UPDATE` prevents concurrent processing of the same payment session. |
| Auto-refund safety net | If order fulfillment fails for any reason after payment, the system automatically refunds the buyer via Stripe. |
| PCI-DSS Level 1 | Card data is handled entirely by Stripe. VendorTrack never sees or stores raw card numbers. |
| 256-bit SSL encryption | All payment transactions are encrypted in transit. |

### 5.3 Order Confirmation

After a successful payment, you are redirected to the buyer orders page with a `payment_success=true` query parameter. A toast notification confirms that your payment has been captured and fulfillment is being tracked. The order appears in your transactional ledger with a "pending" status, and the seller is notified of the new order.

### 5.4 Payment Methods

The Stripe Payment Element supports a variety of payment methods depending on the seller's Stripe configuration and your location. Common supported methods include:

- Credit cards (Visa, Mastercard, American Express, etc.)
- Debit cards
- Apple Pay and Google Pay (where available)
- Regional payment methods (varies by country)

The available payment methods are dynamically rendered by the Stripe Payment Element based on the PaymentIntent configuration and your browser capabilities.

---

## 6. Orders

### 6.1 Order Statuses

Orders on VendorTrack progress through the following statuses:

| Status | Description | Who Sets It |
|--------|-------------|-------------|
| Pending | The order has been placed and payment confirmed. Awaiting seller action. | System (automatic upon payment confirmation) |
| Processing | The seller is preparing the order for shipment. (Not currently used in the UI; pending transitions directly to shipped.) | Seller |
| Shipped | The seller has shipped the order. Tracking information should be available. | Seller |
| Delivered | The order has been delivered to the buyer. | Seller |
| Cancelled | The order has been cancelled. This may occur due to a refund or inventory issues. | System or Administrator |

Status transitions follow a strict progression:

```
Pending --> Shipped --> Delivered
```

A seller cannot skip steps (e.g., moving directly from "pending" to "delivered"). Once an order is marked as "delivered," no further status changes are allowed.

### 6.2 Order Tracking

When a seller marks an order as "shipped," they provide shipping details including:

- **Carrier**: The name of the shipping carrier (e.g., FedEx, UPS, DHL).
- **Tracking Number**: The carrier's tracking number for the shipment.

These details are visible to the buyer in the order history. Buyers can use the tracking number with the carrier's website to monitor the shipment's progress. The tracking information is displayed in the order details and is accessible from both the buyer and seller order views.

### 6.3 Refund Process

The refund process on VendorTrack is designed to be fair and transparent:

**Step 1 -- Buyer Requests Refund**:
The buyer initiates a refund request from the order history page. They must provide a reason (minimum 10 characters) explaining why they need a refund. The `requestRefund` server action verifies that the buyer owns the order and updates the order's `refund_status` to "requested." An audit log entry is created.

**Step 2 -- Administrator Reviews**:
A platform administrator reviews the refund request. The administrator can see the order details, the buyer's reason, and the order status. The administrator decides whether to approve or reject the request.

**Step 3 -- Refund Processing** (if approved):
If the administrator approves the refund:
- The system calls the Stripe Refund API to reverse the payment.
- The Stripe refund is confirmed before the database is updated.
- The order status is updated.
- A financial ledger entry is created for the refund.
- Both the buyer and seller are notified.

**Step 4 -- Refund Rejection** (if rejected):
If the administrator rejects the refund:
- The order's `refund_status` is updated to "rejected."
- An audit log entry is created.
- The buyer is notified.

**Critical Rule**: No refund may exist in the database unless Stripe confirms it. If the Stripe refund call fails, the database is not updated. If the database update fails after a successful Stripe refund, a CRITICAL alert is logged for manual reconciliation.

Partial refunds are supported by specifying an amount less than the full order total.

---

## 7. Chat

### 7.1 Order Chat Between Buyers and Sellers

VendorTrack provides a real-time chat system that allows buyers and sellers to communicate directly about an order. The chat is accessible from both the buyer orders page and the seller orders page. When either party clicks the chat button on an order row, a side panel opens with the Order Chat component.

The chat is scoped to a specific order, ensuring that conversations are contextual and relevant. The chat interface includes:

- **Header**: Displays the order reference number and product name.
- **Message area**: Shows all messages in chronological order, with the current user's messages aligned to the right and the other party's messages aligned to the left.
- **Message input**: A text field and send button at the bottom of the panel.

### 7.2 Chat Component

The Order Chat component (`OrderChat`) provides the following features:

- **Real-time updates**: Messages are delivered in real-time using Supabase Realtime (Postgres Changes). When a new message is inserted into the `messages` table, all participants in the conversation receive the update immediately.
- **Automatic conversation creation**: The first message in a conversation automatically creates a `conversations` record linking the buyer, seller, and order.
- **Message sanitization**: All chat messages are sanitized before display and storage using the `sanitizeChatMessage` function to prevent XSS attacks. Messages are also encoded with `encodeHTML` before rendering.
- **Auto-scroll**: The chat automatically scrolls to the latest message when a new message is received.
- **Loading states**: A spinner is displayed while messages are being loaded.
- **Unread message indicators**: The `useUnreadMessages` hook tracks which conversations have unread messages, providing visual indicators on the chat buttons in the order tables.

**Security**: The chat system enforces that only the buyer and seller associated with an order can participate in the conversation. Messages are sanitized both on input (before storage) and on output (before rendering) to prevent cross-site scripting attacks.

---

## 8. Notifications

### 8.1 Notification Types

VendorTrack uses a background job processing system to deliver notifications for important events. The following notification types are supported:

| Notification Type | Trigger | Recipient |
|-------------------|---------|-----------|
| `payment_success_buyer` | Payment confirmed via webhook | Buyer |
| `payment_success_seller` | Payment confirmed via webhook | Seller |
| `refund_processed_buyer` | Refund approved and processed via Stripe | Buyer |

Notifications are queued as background jobs and processed asynchronously. If a notification fails to send, it is retried up to three times with exponential backoff.

### 8.2 Background Job Processing

The notification system is built on the payment job queue infrastructure. When an event occurs that requires a notification, the notification service enqueues a job with the `notification` type. The job queue works as follows:

1. **Enqueue**: A job is inserted into the `payment_job_queue` table with a "pending" status.
2. **Claim**: A worker polls the queue using the `claim_next_queue_job()` RPC, which uses `SELECT FOR UPDATE SKIP LOCKED` to ensure that each job is processed by exactly one worker.
3. **Execute**: The worker executes the job handler (e.g., sending an email or push notification).
4. **Complete**: If the handler succeeds, the job is marked as "completed."
5. **Retry**: If the handler fails, the job's attempt count is incremented. If the attempt count is less than the maximum (3 for notifications), the job is reset to "pending" for retry. If the maximum is exceeded, the job is marked as "dead" and requires manual intervention.

This architecture ensures that notifications are delivered reliably even in the face of temporary failures, and that no notification is lost due to a transient error.

---

## 9. Account Management

### 9.1 Profile Settings

Sellers can manage their profile settings at `/seller-dashboard/settings`. The settings page allows you to update:

- **Store Logo**: Upload a new image file. The previous logo is replaced.
- **Store Name**: Change the name of your store as it appears to buyers.
- **Store Description**: Update the description of your store.
- **Payout Email**: Change the email address associated with your payouts.

All changes are saved to your profile in the database. The store logo is uploaded to Supabase Storage under the `market-assets` bucket with a unique filename.

Buyers can view their profile information through the authenticated layout but do not have a dedicated settings page in the current version. Buyer profile information (name, email) is managed through the authentication system.

### 9.2 Role Switching

Role switching is not supported on VendorTrack. Each account is permanently assigned a single role (buyer or seller) at the time of registration. This is a deliberate design decision for the following reasons:

- **Audit Trail Integrity**: Financial transactions must be clearly attributable to either a buyer or a seller. Allowing role switching would complicate the audit trail and make it difficult to trace the origin of financial events.
- **Security**: Buyer and seller accounts have different permissions and access levels. Keeping these separate prevents privilege escalation.
- **Data Consistency**: Orders, products, and financial records are associated with specific roles. Switching roles would create data integrity issues.

If you need both buyer and seller capabilities, you must create two separate accounts with different email addresses. There is no limit on the number of accounts you can create, provided each uses a unique email address.

---

## 10. FAQ

### General

**Q: What is VendorTrack?**
A: VendorTrack is a multi-vendor marketplace platform where independent sellers list products for buyers to purchase. The platform handles product discovery, shopping cart management, secure payment processing through Stripe, order fulfillment tracking, and buyer-seller communication.

**Q: Is there a fee for using VendorTrack?**
A: There is no fee for buyers. Sellers are charged a 10% commission on each sale, which is automatically deducted from the payment before the remaining funds are transferred to the seller's Stripe Connect account.

**Q: What browsers are supported?**
A: VendorTrack supports all modern browsers including Chrome, Firefox, Safari, and Edge. The platform is responsive and works on both desktop and mobile devices.

### Account

**Q: Can I change my role from buyer to seller (or vice versa)?**
A: No. Your role is set at registration and cannot be changed. If you need both buyer and seller capabilities, create two separate accounts with different email addresses.

**Q: How do I reset my password?**
A: Use the password reset functionality provided by the authentication system. Click the "Forgot Password" link on the login page and follow the instructions sent to your registered email.

**Q: Can I delete my account?**
A: Account deletion is not currently available through the user interface. Contact platform support for assistance with account deletion requests.

### Buying

**Q: How do I find products?**
A: Browse the marketplace at `/products`, use the search bar with autocomplete suggestions, or filter by category and price range. You can also visit a seller's storefront directly at `/store/[id]`.

**Q: How do I pay for my order?**
A: VendorTrack uses Stripe for payment processing. At checkout, you enter your shipping address and payment details in the Stripe Elements form. Your card information is transmitted directly to Stripe and never passes through VendorTrack's servers.

**Q: How do I request a refund?**
A: Go to your order history at `/buyer-orders`, find the order you want to refund, and click the refund button. Provide a reason (minimum 10 characters) and submit the request. An administrator will review your request and either approve or reject it.

**Q: What happens if the seller does not ship my order?**
A: If a seller fails to fulfill your order, you can request a refund through the order history page. VendorTrack's buyer protection policy ensures that you receive a full refund for non-delivered items.

### Selling

**Q: How do I become an approved seller?**
A: Register as a seller, complete the onboarding steps (connect Stripe, complete your store profile, create a product), and wait for administrator approval. Once approved, you can publish products with "Active" status.

**Q: How do I connect my Stripe account?**
A: Navigate to `/seller-dashboard/settings` and follow the Stripe Connect onboarding flow. This authorizes VendorTrack to process payments on your behalf and transfer funds to your connected account.

**Q: When do I get paid?**
A: Payments are processed automatically through Stripe Connect. When a buyer pays for your product, the funds (minus the 10% platform commission) are transferred to your connected Stripe account according to Stripe's payout schedule.

**Q: How do I fulfill an order?**
A: Go to `/seller-dashboard/orders`, find the order, and click the edit button. Update the status to "shipped" and provide the carrier and tracking number. Once the item is delivered, update the status to "delivered."

**Q: Can I use AI to generate product descriptions?**
A: Yes. When creating or editing a product, click the "AI Copywriter" button next to the description field. Fill in the product details and select a tone of voice, and the AI will generate an optimized title, description, bullet points, and closing paragraph that you can apply to the form.

### Payments

**Q: Is my payment information secure?**
A: Yes. VendorTrack uses Stripe for payment processing, which is PCI-DSS Level 1 compliant. Your card details are transmitted directly to Stripe and never pass through VendorTrack's servers. All transactions are encrypted with 256-bit SSL.

**Q: What payment methods are accepted?**
A: The available payment methods depend on your location and the seller's Stripe configuration. Common methods include credit cards, debit cards, Apple Pay, and Google Pay.

**Q: What happens if a payment fails during checkout?**
A: If the payment fails, an error message is displayed on the checkout page. Your cart is preserved so you can try again. No charge is recorded for failed payments.

**Q: How does the 10% commission work?**
A: When a buyer pays for a product, Stripe deducts a 10% application fee from the total amount and transfers the remaining 90% to the seller's connected account. The commission is calculated with integer precision (in cents) to avoid rounding errors.

### Chat

**Q: How do I chat with a seller about my order?**
A: Go to your order history at `/buyer-orders` and click the chat button on the order row. A side panel opens where you can send and receive messages in real-time.

**Q: How do I chat with a buyer about their order?**
A: Go to your orders page at `/seller-dashboard/orders` and click the chat button on the order row. The same chat interface is available for sellers.

**Q: Are chat messages stored?**
A: Yes. All chat messages are stored in the database for audit purposes. Messages are sanitized to prevent XSS attacks and are displayed with HTML encoding for safety.

### Orders

**Q: How long does order fulfillment take?**
A: Fulfillment times vary by seller. VendorTrack encourages sellers to ship within 24 hours to improve their store reliability score. You can track the status of your order in the buyer orders page.

**Q: Can I cancel an order?**
A: Orders cannot be directly cancelled by buyers. If you need to cancel, request a refund through the order history page and provide the reason. An administrator will review your request.

**Q: What do the order statuses mean?**
A: See the [Order Statuses](#61-order-statuses) section above for a detailed explanation of each status.

---

## Appendix: Route Reference

| Route | Role | Description |
|-------|------|-------------|
| `/signup` | Public | Account registration |
| `/login` | Public | Account login |
| `/products` | Both | Marketplace product listing |
| `/products/[id]` | Both | Product detail page |
| `/store/[id]` | Both | Seller public storefront |
| `/cart` | Buyer | Shopping cart management |
| `/checkout` | Buyer | Payment and checkout |
| `/buyer-orders` | Buyer | Order history and management |
| `/seller-dashboard` | Seller | Store overview and statistics |
| `/seller-dashboard/products` | Seller | Product management |
| `/seller-dashboard/orders` | Seller | Order management and fulfillment |
| `/seller-dashboard/settings` | Seller | Store configuration and Stripe |
| `/help` | Both | Help and knowledge base |
| `/terms` | Both | Terms of service |
| `/privacy-policy` | Both | Privacy policy |

---

## Appendix: Server Actions Reference

| Action | Role | Description |
|--------|------|-------------|
| `upsertProduct` | Seller | Create or update a product listing |
| `updateOrderStatus` | Seller | Update order status and tracking info |
| `requestRefund` | Buyer | Request a refund for an order |
| `updateCartItem` | Buyer | Update the quantity of a cart item |
| `removeCartItem` | Buyer | Remove an item from the cart |

---

*This document is intended for end users of the VendorTrack platform. For technical documentation, refer to the Developer Guide and API Reference.*
