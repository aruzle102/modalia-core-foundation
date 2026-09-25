# Modalia Foundation

Build the production foundation of Modalia, a premium, global-ready, multi-vendor e-commerce marketplace starting in Algeria.



IMPORTANT:

This is NOT a landing page, mockup, prototype, or static demo.

Build the real application foundation with scalable architecture, real database structure, reusable components, real routing, and production-quality code.



Do not rush into implementing every feature yet. This phase establishes the foundation that all future Modalia features will build upon.



---



1. BRAND



Brand name:



Modalia



The official visible brand name is ONLY:



Modalia



Do not add:



- Store

- Market

- Marketplace

- DZ

- Algeria

- any other word



to the actual logo/brand name.



The words Store / Market / Marketplace may be used later in contextual copy, SEO, metadata, descriptions, or page titles when appropriate.



Brand personality:



- Premium

- Modern

- Global

- Elegant

- Trustworthy

- Youthful

- Confident

- Minimal

- Futuristic

- Professional

- Memorable



Modalia starts in Algeria but must be architected from day one for future international expansion.



---



2. BUSINESS MODEL



Modalia is a multi-vendor marketplace.



Multiple independent sellers can operate their own stores and sell physical products through the same marketplace.



Product categories must remain completely dynamic.



Potential categories include:



- Fashion

- Shoes

- Sports

- Beauty

- Electronics

- Supplements

- Home

- Accessories

- Lifestyle

- Everyday products

- Other approved physical products



Do NOT hard-code the application around fashion or sports.



---



3. CORE ARCHITECTURE



Create a scalable production-oriented architecture.



Separate:



- UI

- Components

- Features

- Domain/business logic

- Data access

- Services

- Database

- Types

- Validation

- Configuration

- Utilities



Business logic must not be tightly coupled to visual components.



Use reusable domain modules for:



- Products

- Categories

- Stores

- Sellers

- Seller Staff

- Cart

- Orders

- Customers

- Reviews

- Wishlist

- Shipping

- Coupons

- Notifications

- Admin

- AI

- Analytics



Only establish the foundation for these domains in this phase.



Do not create fake functionality merely to make the interface look complete.



---



4. TECHNOLOGY FOUNDATION



Use the project's existing modern React/TypeScript stack.



Prefer:



- TypeScript

- React

- Tailwind CSS

- shadcn/ui where appropriate

- Supabase/PostgreSQL

- Modern routing

- Server-side data operations where supported



Use strong typing throughout the application.



Avoid unnecessary dependencies.



Before adding a library, verify that the existing stack does not already solve the requirement.



---



5. DATABASE FOUNDATION



Use Supabase/PostgreSQL if available.



Create a scalable relational foundation for:



- profiles

- stores

- sellers

- seller_staff

- roles

- permissions

- products

- product_variants

- categories

- brands

- product_images

- inventory

- carts

- cart_items

- orders

- order_items

- seller_orders

- customers

- reviews

- wishlists

- coupons

- shipping_rules

- wilayas

- communes

- notifications

- audit_logs

- site_settings



Create proper:



- Primary keys

- Foreign keys

- Indexes

- Unique constraints

- Timestamps

- Status fields

- Ownership relationships



Design the schema so one customer order can later contain products from multiple sellers while maintaining separate seller orders.



Do not use static JSON as the permanent data architecture.



---



6. MULTI-TENANT FOUNDATION



The marketplace must support seller isolation.



Every seller-owned resource must have a clear ownership relationship.



Examples:



seller → store

seller → products

seller → variants

seller → inventory

seller → orders

seller → staff



Seller A must never be able to access Seller B's private data.



This must eventually be enforced server-side through authorization and database policies.



Never rely on frontend route hiding for security.



---



7. USER / ROLE FOUNDATION



Prepare the following roles:



Customer



Can eventually:



- Browse

- Search

- Add to cart

- Checkout

- Track orders

- Review purchases

- Wishlist products



Customer accounts must NOT be mandatory for basic shopping and checkout.



Seller Owner



Owns and controls one seller store.



Seller Staff



Works inside a seller store with permissions assigned by the Seller Owner.



Super Admin



Has complete platform control.



Create the permission architecture now even if the full dashboards are implemented later.



---



8. AUTHENTICATION FOUNDATION



Prepare Supabase authentication.



Support architecture for:



- Email/password

- Password reset

- Session management

- Seller authentication

- Admin authentication



Do not expose administrative functionality through frontend-only protection.



Protected resources must eventually validate the authenticated user and role server-side.



---



9. ROUTING FOUNDATION



Prepare clean public routes:



/

/shop

/category/:slug

/product/:slug

/store/:slug

/cart

/checkout

/order-success

/track-order

/wishlist

/become-a-seller



Prepare separate protected namespaces for:



Seller administration



and



Super Admin administration.



The exact administrative paths should not be obvious public navigation routes.



IMPORTANT:



Route obscurity is NOT a security mechanism.



Authorization must be enforced independently.



---



10. DESIGN SYSTEM



Create a centralized Modalia Design System.



Use design tokens for:



- Colors

- Typography

- Spacing

- Radius

- Shadows

- Borders

- Motion

- Breakpoints

- Component states



Do NOT scatter arbitrary values throughout the application.



The design system must be easy to update globally later.



---



11. VISUAL IDENTITY



Default direction:



- Near-black

- White

- Premium neutral grays

- Extremely limited accent usage



The interface should feel:



Premium

Minimal

Modern

Cinematic

Professional

Global



Avoid:



- Neon gaming aesthetics

- Excessive gradients

- Excessive glassmorphism

- Cheap marketplace templates

- Excessive rounded cards

- Visual clutter

- Random decorative elements



---



12. TYPOGRAPHY



Use a premium modern sans-serif typography system.



Create tokens for:



- Display

- H1

- H2

- H3

- Body

- Small text

- Caption

- Button

- Navigation

- Prices

- Product metadata



Typography must support:



Arabic

French

English



Arabic must support proper RTL rendering.



---



13. INTERNATIONALIZATION



Build i18n from the beginning.



Initial languages:



- Arabic

- French

- English



User-facing strings must NOT be hard-coded throughout components.



Use translation keys.



Support:



LTR

RTL



The language system must be extendable to additional languages later.



---



14. LOCALIZATION FOUNDATION



Initial market:



Algeria



Default currency:



DZD



Prepare configuration for:



- Country

- Currency

- Language

- RTL/LTR

- Phone format

- Address

- Wilaya

- Commune

- Delivery method



Do not hard-code Algeria-specific logic into components.



Put localization logic into configuration/domain services.



---



15. GLOBAL CONFIGURATION



Create a centralized platform configuration system.



Prepare settings for:



General



- Site name

- Site description

- Contact information



Branding



- Logo

- Favicon

- App icon

- Primary color

- Secondary color

- Accent color



Localization



- Default language

- Available languages

- Currency

- Country



SEO



- SEO title

- SEO description

- OG image

- Robots

- Sitemap configuration



Communication



- WhatsApp

- Email

- Social links



Commerce



- Shipping

- Orders

- Seller settings

- Commission settings

- Reviews



Platform



- AI

- Notifications

- Moderation

- Analytics



The architecture must allow Super Admin to control these settings later without changing code.



---



16. COMPONENT LIBRARY



Create reusable production components:



- Header

- Footer

- Navigation

- Button

- Input

- Select

- Checkbox

- Radio

- Search

- ProductCard

- StoreCard

- CategoryCard

- Price

- Rating

- Badge

- Modal

- Drawer

- Dropdown

- Tabs

- Breadcrumb

- Pagination

- Toast

- Skeleton

- EmptyState

- ErrorState

- LoadingState

- ConfirmationDialog



All components must use the centralized design system.



---



17. HEADER FOUNDATION



Create a responsive premium header.



Desktop:



- Modalia wordmark

- Main navigation

- Search

- Wishlist

- Cart

- Account



Mobile:



- Modalia

- Search

- Cart

- Menu



Keep the header clean.



Do not overload it.



---



18. FOOTER FOUNDATION



Create a scalable dynamic footer.



Prepare sections for:



- About

- Customer Service

- Shipping

- Returns

- Become a Seller

- Contact

- Privacy

- Terms

- Social

- Newsletter



Footer sections should eventually be controlled by Super Admin.



---



19. RESPONSIVE SYSTEM



Mobile-first.



Support:



- Small mobile

- Large mobile

- Tablet

- Laptop

- Desktop

- Large desktop



Do not simply scale the desktop interface down.



Create proper responsive layouts.



---



20. ACCESSIBILITY



Build accessibility into the foundation:



- Semantic HTML

- Keyboard navigation

- Focus states

- Proper labels

- Accessible forms

- Screen-reader-friendly components

- Good contrast

- Reduced-motion support



Follow accessible interaction patterns.



---



21. PERFORMANCE FOUNDATION



Prepare the project for high performance.



Implement architecture supporting:



- Code splitting

- Lazy loading

- Image optimization

- Responsive images

- Lazy image loading

- Skeleton loading

- Error boundaries

- Efficient state management

- Avoid unnecessary re-renders

- Proper caching



Do not sacrifice performance for visual effects.



---



22. MOTION SYSTEM



Create a centralized motion system.



Motion style:



- Smooth

- Premium

- Subtle

- Fast

- Cinematic



Use motion selectively for:



- Page transitions

- Navigation

- Product interactions

- Modals

- Cart feedback

- Scroll reveals

- Loading states



Support:



prefers-reduced-motion



Do not animate everything.



---



23. ADAPTIVE VISUAL FOUNDATION



Prepare infrastructure for future adaptive 2.5D/3D experiences.



High-end devices:



- WebGL

- 3D

- particles

- parallax



Medium devices:



- CSS 3D

- lightweight effects

- Lottie-style animation where useful



Low-end devices:



- lightweight CSS

- static images

- minimal motion



Data saver:



- disable expensive effects



Do NOT add heavy WebGL throughout the application now.



Create reusable infrastructure for future pages.



---



24. SEO FOUNDATION



Prepare dynamic SEO architecture.



Every important page must eventually support:



- Dynamic title

- Meta description

- Canonical URL

- Open Graph

- Twitter/social metadata

- Structured data

- Sitemap

- Robots

- Breadcrumb data



Prepare architecture for:



- Product structured data

- Organization structured data

- Store structured data

- Breadcrumb structured data



Do not implement fake SEO data.



---



25. ERROR / LOADING / EMPTY STATES



Every future feature must have a consistent state system.



Prepare reusable:



- Loading

- Skeleton

- Empty

- Error

- Success

- Offline



states.



Never leave blank screens.



---



26. DATA VALIDATION



Create centralized validation architecture.



Prepare reusable validation for:



- Product data

- Seller data

- Customer data

- Addresses

- Phone numbers

- Prices

- Inventory

- Orders

- Reviews

- Coupons



Never trust client-side validation alone.



---



27. AUDIT FOUNDATION



Prepare audit logging architecture.



Audit events should eventually capture:



- Authentication events

- Seller changes

- Product changes

- Order changes

- Commission changes

- Admin actions

- Settings changes

- Moderation decisions

- Security events



Include:



- actor

- action

- resource

- resource_id

- timestamp

- metadata



---



28. FILE / MEDIA FOUNDATION



Prepare secure media architecture for:



- Product images

- Store logos

- Store banners

- User review images

- Seller documents

- 3D assets



Separate public and private media conceptually.



Do not allow arbitrary executable uploads.



Detailed file-security hardening will be performed in the final Security phase.



---



29. FUTURE FEATURE COMPATIBILITY



The foundation must not prevent future implementation of:



- Multi-seller cart

- Seller-specific shipping

- COD

- Algeria Wilaya/Commune delivery

- Seller commissions

- Manual settlements

- Seller dashboards

- Seller staff

- Product variants

- Size/color systems

- Wishlist

- Reviews

- Anonymous personalization

- AI shopping assistant

- AI product descriptions

- Recommendations

- Homepage builder

- Flash sales

- Coupons

- Notifications

- Analytics

- Moderation

- Super Admin



Do not implement these fully in this phase.



Design the foundation so they can be added without restructuring the entire application.



---



30. QUALITY RULES



Do NOT:



- Create fake buttons

- Create fake statistics

- Use fake permanent data

- Hard-code business rules into UI

- Duplicate components unnecessarily

- Create unnecessary pages

- Add unnecessary dependencies

- Build security only on the frontend

- Create a generic template-looking marketplace



Every implemented element must have a clear purpose.



---



31. FINAL VALIDATION



Before finishing this phase:



1. Run the application.

2. Fix TypeScript errors.

3. Fix build errors.

4. Fix routing errors.

5. Verify database schema.

6. Verify relationships.

7. Verify responsive behavior.

8. Verify RTL/LTR foundation.

9. Verify theme tokens.

10. Verify reusable components.

11. Verify loading/error/empty states.

12. Verify no broken links.

13. Verify no obvious console errors.

14. Verify the project is ready for the next development phase.



Do NOT continue implementing the next major features automatically.



Stop after the foundation is stable.



The next phase will build:



Modalia Homepage + Navigation + Shop + Search + Categories + Product Discovery + Premium Motion Experience.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://modalia-core-foundation.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6d659167-d0b7-460b-b79d-281e78cd2472).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
