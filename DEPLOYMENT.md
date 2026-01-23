# Deployment Guide

## Deploying Edge Functions

### Prerequisites

1. **Install Supabase CLI:**
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase:**
   ```bash
   supabase login
   ```

3. **Link to your project:**
   ```bash
   supabase link --project-ref your-project-ref
   ```

### Deploy Functions

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy invite-staff
supabase functions deploy order-lookup
supabase functions deploy qr-resolve
supabase functions deploy place-order
```

### Verify Deployment

```bash
# List deployed functions
supabase functions list

# View function logs
supabase functions logs invite-staff
```

## Environment Variables

### Required Variables

Create `.env` file:

```bash
# Supabase
VITE_SUPABASE_PROJECT_ID=your-project-id
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_ANON_KEY=your-anon-key

# Optional: Monitoring
VITE_SENTRY_DSN=your-sentry-dsn
VITE_POSTHOG_KEY=your-posthog-key
VITE_POSTHOG_HOST=https://app.posthog.com
```

### Edge Function Secrets

Set secrets for Edge Functions:

```bash
# Set allowed origin for CORS
supabase secrets set ALLOWED_ORIGIN=https://your-domain.com

# Verify secrets
supabase secrets list
```

## Database Migrations

### Apply Migrations

```bash
# Apply all pending migrations
supabase db push

# Reset database (WARNING: destructive)
supabase db reset
```

### Create New Migration

```bash
# Generate migration from schema changes
supabase db diff -f migration_name

# Create empty migration
supabase migration new migration_name
```

## Frontend Deployment

### Build for Production

```bash
# Build optimized bundle
npm run build

# Preview production build
npm run preview
```

### Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

### Deploy to Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy

# Deploy to production
netlify deploy --prod
```

## Post-Deployment Checklist

- [ ] Verify all Edge Functions are deployed
- [ ] Test critical flows in production
- [ ] Monitor error rates in Sentry
- [ ] Check activity logs for rate limiting
- [ ] Verify environment variables are set
- [ ] Test authentication flows
- [ ] Verify database migrations applied
- [ ] Check PWA functionality
- [ ] Test on mobile devices

## Monitoring

### Activity Logs Query

```sql
-- Check rate limiting effectiveness
SELECT 
  action,
  COUNT(*) as total_attempts,
  COUNT(DISTINCT ip) as unique_ips,
  MAX(created_at) as last_attempt
FROM activity_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY action
ORDER BY total_attempts DESC;
```

### Error Monitoring

- **Sentry:** Monitor runtime errors
- **Supabase Logs:** Check Edge Function errors
- **Browser Console:** Check client-side errors

## Rollback Procedure

### Rollback Edge Function

```bash
# List function versions
supabase functions list

# Deploy previous version
# (manually redeploy from git history)
git checkout previous-commit
supabase functions deploy function-name
git checkout main
```

### Rollback Database

```bash
# Revert last migration
supabase migration repair --status reverted

# Apply specific migration
supabase db push --include-migrations migration-name
```

## Performance Optimization

### Edge Function Performance

- Monitor latency in Supabase dashboard
- Optimize database queries
- Consider caching for frequently accessed data
- Use connection pooling

### Frontend Performance

- Analyze bundle size: `npm run build -- --analyze`
- Optimize images
- Enable PWA caching
- Use lazy loading for routes

## Security Checklist

- [ ] Rate limiting enabled on all Edge Functions
- [ ] RLS policies tested and verified
- [ ] Environment variables secured
- [ ] HTTPS enforced
- [ ] CORS configured correctly
- [ ] Authentication flows tested
- [ ] Activity logging enabled
- [ ] Error messages don't leak sensitive data
