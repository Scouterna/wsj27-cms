# wsj27-cms — deployment

Manifests for deploying this CMS, served at
`https://campfire.wsj27.scouterna.net/_services/cms` in the `wsj27` namespace
on Scouterna's shared AKS cluster.

**Nothing applies these automatically** — CI only builds and pushes the image.
Applying is a deliberate manual act:

```bash
export KUBECONFIG=~/.kube/wsj27.yaml

IMG=ghcr.io/scouterna/wsj27-cms
(cd k8s && kustomize edit set image "$IMG=$IMG:sha-<short sha>") && kubectl apply -k k8s
# then revert the kustomization edit — never commit a real tag
```

The tag CI pushes is `sha-` plus the **short** sha (`docker/metadata-action`'s
`type=sha` prefixes it), so the full 40-character sha is not a tag that exists
and pasting one gives `ImagePullBackOff`. Read the tag off the build run, or:

```bash
git rev-parse --short HEAD   # matches the tag for a pushed commit
```

The committed `newTag` is a deliberate placeholder so that applying unedited
fails fast (`ImagePullBackOff`) instead of silently deploying `latest`. Always
deploy a `sha-` tag; CI pushes one per commit.

## One-time setup, in order

1. **Make the GHCR package public** after the first image build
   (Scouterna org → Packages → wsj27-cms). The manifests use no
   `imagePullSecrets` — same as wsj27-auth-api — so a private package gives
   `ImagePullBackOff`.

2. **Create the database** on the in-cluster Postgres (`wsj27-postgres-temp`),
   with its own role so the CMS cannot touch the other apps' data:

   ```bash
   kubectl exec -it statefulset/wsj27-postgres-temp -n wsj27 -- \
     psql -U wsj27 -d wsj27 \
     -c "CREATE ROLE wsj27cms LOGIN PASSWORD '<generate one>';" \
     -c "CREATE DATABASE wsj27cms OWNER wsj27cms;"
   ```

   The server is called *temp* for a reason — when it is replaced, the CMS
   only needs `DATABASE_URL` in the secret updated and a pod restart.
   Payload's migrations run at boot, so a fresh database initializes itself.

3. **Create the secret** (the deployment's `envFrom` expects both keys):

   ```bash
   kubectl create secret generic wsj27-cms-secrets -n wsj27 \
     --from-literal=PAYLOAD_SECRET="$(openssl rand -hex 32)" \
     --from-literal=DATABASE_URL="postgresql://wsj27cms:<password>@wsj27-postgres-temp:5432/wsj27cms"
   ```

   `PAYLOAD_SECRET` signs Payload's own tokens/cookies — rotating it logs
   everyone out but destroys nothing.

4. **Create the font configmap.** The brand fonts (Bravely Script, and
   TeeFranklin which is the face behind the profile's "Lieberath Grotesque")
   are commercial and deliberately not in this public repository. They mount
   into `public/fonts/` from a configmap; the volume is `optional`, so
   without it the pages fall back to system fonts instead of failing:

   ```bash
   # from the contingent's graphic package; woff2_compress is in the
   # `woff2` package on Debian
   woff2_compress BravelyScript-Regular.otf
   woff2_compress TeeFranklin-Book.otf      # a.k.a. TeeFraBoo.otf
   woff2_compress TeeFranklin-Bold.otf      # a.k.a. TeeFraBol.otf
   kubectl create configmap wsj27-cms-fonts -n wsj27 \
     --from-file=BravelyScript-Regular.woff2 \
     --from-file=TeeFranklin-Book.woff2 \
     --from-file=TeeFranklin-Bold.woff2
   ```

   The file names are load-bearing — the @font-face declarations in
   `src/app/(frontend)/handbok/page.tsx` reference them verbatim.

5. **Apply** (command at the top), then watch:

   ```bash
   kubectl rollout status deploy/wsj27-cms -n wsj27
   kubectl logs -l app=wsj27-cms -n wsj27 --tail=50
   curl -s -o /dev/null -w '%{http_code}\n' https://campfire.wsj27.scouterna.net/_services/cms
   ```

6. **Give someone access.** Login is SSO-only via wsj27-auth-api. CMT members
   (any `wsj27:cmt…` project role) get editor access out of the box; everyone
   else needs a `wsj27-cms:editor` grant in wsj27-project-api's role map, and
   admin (user management) always requires an explicit `wsj27-cms:admin`.
   A user with none of these is treated as logged out — there is no local
   fallback account, by design.

## Constraints the manifests encode

- **`replicas: 1` + `strategy: Recreate`** — the uploads PVC is ReadWriteOnce
  (an Azure disk), so a rolling replacement pod can generally not mount it.
  A deploy therefore has a few seconds of downtime. If the CMS ever needs
  more replicas, media storage has to move to blob storage
  (`@payloadcms/storage-azure`) first.
- **The TLS secret belongs to `testapp`.** The `testapp` Ingress carries the
  cert-manager annotations for campfire.wsj27.scouterna.net; this ingress (like
  wsj27-auth-api's) only references `testapp-tls`. If testapp is ever removed,
  the annotations — and the ownership of the certificate — must move to one of
  the surviving ingresses on the host.
- **The base path is baked into the image.** Changing the serving path means
  changing the `NEXT_BASE_PATH` build-arg in the app repo's CI and rebuilding,
  not just editing the ingress. The ingress deliberately has no strip-prefix.
- **Traefik does not cap request body size by default**, so media uploads work
  without a middleware. j26 capped it at 50 MiB as protection; if that is
  wanted here it is a `Middleware` CRD, which the wsj27 kubeconfig currently
  has no rights to create.
