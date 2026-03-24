This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### 1. Configure the API origin

Copy the example env file and set `NEXT_PUBLIC_API_ORIGIN` to your backend:

```bash
cp .env.local.example .env.local
```

| Scenario | Value |
|---|---|
| Local backend (`localhost:8080`) | `NEXT_PUBLIC_API_ORIGIN=http://localhost:8080` |
| Test against production backend | `NEXT_PUBLIC_API_ORIGIN=https://viksi.ai` |

> **Important:** The value must be a plain origin — scheme + host, **no path suffix**.
> `https://viksi.ai` ✅ — `https://viksi.ai/api` ❌
> After editing `.env.local` you **must restart** `npm run dev` for the change to take effect (`NEXT_PUBLIC_*` vars are baked at startup).

#### Cross-site cookie limitation

Running the Next dev server (`http://localhost:3000`) against the **production** backend (`https://viksi.ai`) is a cross-origin request. The `JSESSIONID` session cookie set by the backend has `SameSite=Lax` by default, which means the browser **will not** include it in cross-origin `fetch()` calls. This causes 401 errors on `GET /api/v1/auth/ws-ticket` even after a successful login.

**Solutions (pick one):**
- Open the deployed app on `https://viksi.ai` (same-origin — cookies work normally)
- Ask the backend team to set `SameSite=None; Secure` on the `JSESSIONID` cookie

### 2. Run the development server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
