#!/bin/bash
# Kept with run.sh (pkp/pkp-lib#13781 / #13780, round 3): plant.sh <app> <from> <database.sql>
# 3_4fp: the context's primary locale becomes fr_FR. omp: two spotlights
# (series 1; the published book) titled in English and French, for I9262.
app=$1; from=$2; f=$3
case $app in ojs) t=journals;; omp) t=presses;; ops) [ "${from:0:3}" = 3_3 ] && t=journals || t=servers;; esac
if [ "$from" = 3_4fp ]; then
  awk -v t="$t" '$0 ~ "^COPY public\\."t" " {f=1; print; next} f && /^\\\./ {f=0} f && $1==1 {sub(/\ten\t/, "\tfr_FR\t")} {print}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
fi
if [ "$app" = omp ]; then
  if [ "${from:0:3}" = 3_3 ]; then en=en_US; book=5; else en=en; book=14; fi
  awk -v en="$en" -v book="$book" -v v="${from:0:3}" '
    /^COPY public\.spotlights / {print; print "1\t3\t1\t1"; print "2\t4\t" book "\t1"; next}
    /^COPY public\.spotlight_settings / {print
      n=0; split("1 " en " Series spotlight|1 fr_FR Collection à la une|2 " en " Book spotlight|2 fr_FR Livre à la une", r, "|")
      for (i=1;i<=4;i++) { split(r[i], c, " "); title=substr(r[i], length(c[1])+length(c[2])+3)
        if (v=="3_3") print c[1] "\t" c[2] "\ttitle\t" title "\tstring"; else print i "\t" c[1] "\t" c[2] "\ttitle\t" title "\tstring" }
      next}
    {print}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
fi
