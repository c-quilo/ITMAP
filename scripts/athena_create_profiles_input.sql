CREATE EXTERNAL TABLE imperial_profiles_input (
  ord int,
  profile_url string,
  full_name string,
  openalex_id string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
LOCATION 's3://openalex-june-2026/athena-inputs/openalex-profiles/'
TBLPROPERTIES ('skip.header.line.count'='1')
