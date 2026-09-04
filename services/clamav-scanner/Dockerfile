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

# The image's own supervisor starts clamd and freshclam. Both stay on: freshclam
# keeps signatures current, and a scanner running yesterday's database is a
# scanner that misses today's malware.
#
# The variable names are the ones /init actually reads — CLAMAV_NO_FRESHCLAMD,
# not CLAMAV_NO_FRESHCLAM. The first attempt used the wrong one, which is why
# freshclam was running while clamd was not: two different variables, and only
# one of them was being answered.
ENV CLAMAV_NO_CLAMD=false
ENV CLAMAV_NO_FRESHCLAMD=false

RUN apk add --no-cache nodejs

WORKDIR /srv
COPY server.js /srv/server.js

ENV PORT=8080
EXPOSE 8080

# ENTRYPOINT is cleared deliberately, and this is the line that took three
# deploys to get right.
#
# The base image's entrypoint is /init, so a CMD is passed to it as ARGUMENTS —
# and /init has a branch for that: given an argument that is an executable, it
# sets CLAMAV_NO_CLAMD=true and execs it instead of starting clamd. So
# `CMD ["/bin/sh", "-c", …]` became `/init /bin/sh -c …`, clamd was disabled by
# the image itself, and the environment variable was inherited by the inner
# /init too. freshclam ran, the database downloaded, the socket was never
# created, and the startup probe refused the revision — correctly, for a reason
# that had nothing to do with anything the probe could see.
#
# With the entrypoint cleared, /init runs with no arguments and starts clamd the
# way it is meant to. The HTTP front runs beside it.
ENTRYPOINT []
CMD ["/bin/sh", "-c", "node /srv/server.js & exec /init"]
