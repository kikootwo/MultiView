# Docker Image Setup Guide

This guide explains how to set up GitHub Container Registry for MultiView and make your image publicly available.

## Initial Setup

### 1. Enable GitHub Container Registry

The GitHub Actions workflow automatically publishes a unified Docker image to GitHub Container Registry (ghcr.io) on every push to `main`.

### 2. Update Repository Settings

After your first successful build, you need to make the image public:

1. Go to your GitHub profile: `https://github.com/YOUR_USERNAME?tab=packages`
2. Find the `multiview` package
3. Click on it, then go to "Package settings"
4. Scroll down to "Danger Zone"
5. Click "Change visibility" → "Public"

### 3. Update Configuration Files

The image URL in `docker-compose.yml` should match your GitHub username:

**docker-compose.yml:**
```yaml
image: ghcr.io/YOUR_USERNAME/multiview:latest
```

**README.md:**
- Update all references to match your GitHub username
- Update the badge URL in the header

These have been pre-configured with `kikootwo` as the username. Update if you fork the repository.

## Using the Image

### Pull and Run

Once the image is published, anyone can use it:

```bash
# Pull latest image
docker-compose pull

# Start service
docker-compose up -d
```

### Environment Variables

All environment variables work the same way with pre-built images:

```yaml
environment:
  - PORT=9292
  - ENCODER_PREFERENCE=auto
  - M3U_SOURCE=http://example.com/playlist.m3u
  - IDLE_TIMEOUT=300
```

### Hardware Acceleration

Hardware acceleration (GPU support) works with pre-built images:

**NVIDIA:**
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu, video]
```

**Intel/AMD:**
```yaml
devices:
  - /dev/dri:/dev/dri
```

## Building Locally

If you need to build the image locally:

1. Edit `docker-compose.yml`
2. Comment out the `image:` line
3. Uncomment the `build:` section
4. Run: `docker-compose up -d --build`

The build uses `Dockerfile.unified` which creates a multi-stage build combining the Next.js frontend and FastAPI backend into a single image.

## Versioning

### Semantic Versioning

Create tagged releases for stable versions:

```bash
# Tag a release
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

This creates an image tagged as:
- `ghcr.io/YOUR_USERNAME/multiview:v1.0.0`
- `ghcr.io/YOUR_USERNAME/multiview:v1.0`
- `ghcr.io/YOUR_USERNAME/multiview:v1`
- `ghcr.io/YOUR_USERNAME/multiview:latest`

### Using Specific Versions

Pin to a specific version in docker-compose.yml:

```yaml
image: ghcr.io/YOUR_USERNAME/multiview:v1.0.0
```

## Troubleshooting

### Images Not Found

If `docker-compose pull` fails:
1. Check that packages are public (see step 2 above)
2. Verify the username in image URLs matches your GitHub username
3. Check that the GitHub Actions workflow has run successfully

### Build Failures

View GitHub Actions logs:
1. Go to your repository
2. Click "Actions" tab
3. Click on the latest workflow run
4. Check the build logs for errors

### Local Development

For development, always build locally:
```bash
docker-compose up -d --build
```

This ensures you're testing your local changes, not published images.

## Image Details

### Unified Image
- **Base**: `linuxserver/ffmpeg:latest`
- **Size**: ~900MB (combined frontend + backend)
- **Includes**:
  - Next.js 15 static build (frontend)
  - Python 3 + FastAPI (backend)
  - FFmpeg 8.0 with all hardware encoder support
  - Single-port serving (9292)
- **Platform**: linux/amd64
- **Build**: Multi-stage (frontend built separately, then copied)

## Security

### Private Images

If you need private images:
1. Keep packages private (default)
2. Authenticate before pulling:
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
   ```
3. Then use `docker-compose pull`

### Secrets

Never include secrets in images:
- Use environment variables for sensitive data
- Don't commit `.env` files
- Use GitHub Secrets for CI/CD credentials
