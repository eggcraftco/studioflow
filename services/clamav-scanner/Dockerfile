# ClamAV as a scanning service, scaled to zero.
#
# The official image already runs clamd and freshclam; this adds a small HTTP
# front so the Storage trigger can post bytes and get a verdict back. Node is
# present in the image's package set, so nothing heavier is pulled in.
#
# Scale-to-zero is deliberate. Loading the signature database takes the better
# part of a minute, so the first request after an idle period is slow — and that
# is fine here, because the file's download token is already held before this
# service is ever called. The file is unreachable while we wait.
FROM clamav/clamav:1.4

# freshclam runs on boot in this image; the database is baked in as a floor so a
# cold start is not also a download.
ENV CLAMAV_NO_FRESHCLAMD=false

RUN apk add --no-cache nodejs

WORKDIR /srv
COPY server.js /srv/server.js

ENV PORT=8080
EXPOSE 8080

# clamd first, then the HTTP front. The front reports not-ready until clamd
# answers, so Cloud Run's health check does not send traffic to a scanner that
# has no signatures loaded yet — a scanner that says "clean" because it has
# nothing to compare against is the worst possible failure here.
CMD ["/bin/sh", "-c", "/init-unprivileged & exec node /srv/server.js"]
