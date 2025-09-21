# Grocery Trip Planner

## Overview

A comprehensive web application that optimizes grocery shopping trips by analyzing price, time, and distance factors. Users can create shopping lists, set their location, and receive intelligent trip plans that suggest optimal store combinations to minimize cost and travel time. The system integrates with Mapbox for geocoding and routing, maintains a database of stores, items, and prices, and provides a sophisticated scoring algorithm to rank trip options.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Radix UI primitives with shadcn/ui component library for consistent design
- **Styling**: Tailwind CSS with CSS variables for theming and responsive design
- **State Management**: React Query (TanStack Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation for type-safe form handling

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **API Design**: RESTful endpoints with JSON responses
- **File Structure**: Monorepo structure with shared types and schemas between client and server

### Data Storage Solutions
- **Database**: PostgreSQL with Neon Database as the cloud provider
- **Schema Design**: 
  - `stores` table with geocoded coordinates and operating hours
  - `items` table with product details and categorization
  - `prices` table linking items to stores with temporal pricing data
  - `store_items` table for inventory tracking
  - `shopping_lists` and `trip_plans` for user-generated content
- **Migrations**: Drizzle Kit for database schema management and migrations

### Authentication and Authorization
- Session-based authentication using PostgreSQL session storage
- User management system with secure credential handling
- Currently supports basic user operations (creation, lookup)

### External Service Integrations
- **Mapbox API**: 
  - Geocoding service for address-to-coordinate conversion
  - Matrix API for calculating travel times and distances between multiple points
  - Map visualization for store locations and trip routes
- **Geographic Services**: Haversine distance calculations for store filtering within radius

### Trip Planning Algorithm
- **Store Selection**: Filters stores within user-defined radius using geographic calculations
- **Coverage Analysis**: Generates single-store and multi-store combinations to cover entire shopping list
- **Optimization Scoring**: Weighted composite score combining:
  - Price optimization using cheapest available prices per item
  - Travel time from Mapbox routing
  - Total distance calculations
  - Z-score normalization for fair comparison across metrics
- **Route Generation**: Creates optimized store visit sequences with mapping service integration

### Import and Data Management
- CSV import functionality for bulk data loading (stores, items, prices)
- Data validation using Zod schemas
- Administrative interface for data management and statistics
- Fuzzy matching for item name resolution during list creation

### Development and Build System
- **Development**: Hot module replacement with Vite dev server
- **Production Build**: Server bundling with esbuild, client bundling with Vite
- **Type Safety**: Comprehensive TypeScript coverage across client, server, and shared code
- **Code Quality**: ESLint configuration and consistent formatting

## External Dependencies

### Core Runtime Dependencies
- **@neondatabase/serverless**: PostgreSQL database connectivity for serverless environments
- **drizzle-orm**: Type-safe database ORM with PostgreSQL support
- **express**: Web application framework for the backend API
- **react**: Frontend UI library with hooks and modern patterns
- **@tanstack/react-query**: Server state management and caching

### UI and Styling
- **@radix-ui/***: Comprehensive set of unstyled, accessible UI primitives
- **tailwindcss**: Utility-first CSS framework for styling
- **class-variance-authority**: Type-safe utility for conditional CSS classes
- **lucide-react**: Icon library with consistent design language

### Development Tools
- **vite**: Fast build tool and development server
- **typescript**: Static type checking and enhanced developer experience
- **drizzle-kit**: Database migration and schema management tool
- **esbuild**: Fast JavaScript bundler for production builds

### External APIs
- **Mapbox**: Geocoding, routing, and mapping services requiring API token configuration
- **Environment Variables**: 
  - `DATABASE_URL`: PostgreSQL connection string
  - `MAPBOX_ACCESS_TOKEN` or `MAPBOX_TOKEN`: API authentication for mapping services

### Data Processing
- **zod**: Runtime type validation and schema definition
- **date-fns**: Date manipulation and formatting utilities
- **connect-pg-simple**: PostgreSQL session store for Express sessions
- **ws**: WebSocket implementation for database connections