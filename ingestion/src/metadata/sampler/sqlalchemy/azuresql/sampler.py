#  Copyright 2021 Collate
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  http://www.apache.org/licenses/LICENSE-2.0
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
"""
Helper module to handle data sampling
for the profiler
"""
from typing import List, Optional

from sqlalchemy import Column, Table, text
from sqlalchemy.sql.selectable import CTE

from metadata.generated.schema.entity.data.table import TableData
from metadata.sampler.sqlalchemy.sampler import ProfileSampleType, SQASampler


class AzureSQLSampler(SQASampler):
    """
    Generates a sample of the data to not
    run the query in the whole table.
    """

    # These types are not supported by pyodbc - it throws
    # an error when trying to fetch data from these columns
    # pyodbc.ProgrammingError: ('ODBC SQL type -151 is not yet supported.  column-index=x  type=-151', 'HY106')
    NOT_COMPUTE_PYODBC = {"SQASGeography", "UndeterminedType"}

    def set_tablesample(self, selectable: Table):
        """Set the TABLESAMPLE clause for MSSQL
        Args:
            selectable (Table): _description_
        """
        if self.sample_config.profile_sample_type == ProfileSampleType.PERCENTAGE:
            return selectable.tablesample(
                text(f"{self.sample_config.profile_sample or 100} PERCENT")
            )

        return selectable.tablesample(
            text(f"{int(self.sample_config.profile_sample or 100)} ROWS")
        )

    def get_sample_query(self, *, column=None) -> CTE:
        """get query for sample data"""
        rnd = self._base_sample_query(column).cte(
            f"{self.raw_dataset.__tablename__}_rnd"
        )
        query = self.client.query(rnd)
        return query.cte(f"{self.raw_dataset.__tablename__}_sample")

    def fetch_sample_data(self, columns: Optional[List[Column]] = None) -> TableData:
        sqa_columns = []
        if columns:
            for col in columns:
                if col.type.__class__.__name__ not in self.NOT_COMPUTE_PYODBC:
                    sqa_columns.append(col)
        return super().fetch_sample_data(sqa_columns or columns)