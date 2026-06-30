CREATE EXTERNAL TABLE IF NOT EXISTS authors_json (
  id string,
  display_name string,
  display_name_alternatives array<string>,
  orcid string,
  works_count int,
  cited_by_count int,
  ids struct<openalex:string,orcid:string>,
  affiliations array<struct<
    institution:struct<id:string,ror:string,display_name:string,country_code:string,type:string,lineage:array<string>>,
    years:array<int>
  >>,
  last_known_institutions array<struct<
    id:string,
    ror:string,
    display_name:string,
    country_code:string,
    type:string,
    lineage:array<string>
  >>
)
PARTITIONED BY (updated_date string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://openalex-june-2026/openalex/data/authors/'
TBLPROPERTIES (
  'ignore.malformed.json'='true',
  'projection.enabled'='true',
  'projection.updated_date.type'='date',
  'projection.updated_date.range'='2026-02-01,2026-03-30',
  'projection.updated_date.format'='yyyy-MM-dd',
  'projection.updated_date.interval'='1',
  'projection.updated_date.interval.unit'='DAYS',
  'storage.location.template'='s3://openalex-june-2026/openalex/data/authors/updated_date=${updated_date}/'
)
