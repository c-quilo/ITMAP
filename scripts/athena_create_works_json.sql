CREATE EXTERNAL TABLE IF NOT EXISTS works_json (
  id string,
  doi string,
  display_name string,
  title string,
  publication_year int,
  cited_by_count int,
  abstract_inverted_index map<string,array<int>>,
  primary_location struct<
    source:struct<
      id:string,
      display_name:string
    >
  >,
  authorships array<struct<
    author:struct<id:string,display_name:string>,
    institutions:array<struct<id:string,display_name:string>>
  >>,
  topics array<struct<id:string,display_name:string,score:double>>,
  concepts array<struct<id:string,display_name:string,score:double>>
)
PARTITIONED BY (updated_date string)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://openalex-june-2026/openalex/data/works/'
TBLPROPERTIES (
  'ignore.malformed.json'='true',
  'projection.enabled'='true',
  'projection.updated_date.type'='date',
  'projection.updated_date.range'='2026-02-01,2026-03-30',
  'projection.updated_date.format'='yyyy-MM-dd',
  'projection.updated_date.interval'='1',
  'projection.updated_date.interval.unit'='DAYS',
  'storage.location.template'='s3://openalex-june-2026/openalex/data/works/updated_date=${updated_date}/'
)
