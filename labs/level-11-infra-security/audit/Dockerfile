# pip-audit (from the Python Packaging Authority) checks Python packages against the
# Python Packaging Advisory Database / OSV. It needs internet access to PyPI.
FROM python:3.12-slim
RUN pip install --no-cache-dir "pip-audit==2.10.1"
WORKDIR /work
ENTRYPOINT ["pip-audit"]
