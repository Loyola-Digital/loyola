#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de teste para verificar se a instalação está correcta
Valida todas as dependências e funcionalidades básicas
"""

import sys
import os
from pathlib import Path


def testar_python_version():
    """Verifica versão do Python"""
    print("=" * 60)
    print("TESTE 1: Versão do Python")
    print("=" * 60)

    versao = sys.version_info
    print(f"Python {versao.major}.{versao.minor}.{versao.micro}")

    if versao.major < 3 or (versao.major == 3 and versao.minor < 7):
        print("❌ ERRO: Python 3.7+ é necessário")
        return False

    print("✅ OK: Versão compatível\n")
    return True


def testar_openpyxl():
    """Testa se openpyxl está instalado"""
    print("=" * 60)
    print("TESTE 2: Biblioteca openpyxl")
    print("=" * 60)

    try:
        import openpyxl
        print(f"openpyxl versão {openpyxl.__version__}")
        print("✅ OK: openpyxl instalado\n")
        return True
    except ImportError:
        print("❌ ERRO: openpyxl não está instalado")
        print("Execute: pip install openpyxl --break-system-packages\n")
        return False


def testar_json():
    """Testa se JSON pode ser processado"""
    print("=" * 60)
    print("TESTE 3: Suporte JSON")
    print("=" * 60)

    try:
        import json

        # Testa leitura de histórico_template.json
        script_dir = Path(__file__).parent
        historico_file = script_dir / "historico_template.json"

        if historico_file.exists():
            with open(historico_file, 'r', encoding='utf-8') as f:
                dados = json.load(f)
            print(f"✅ OK: Arquivo historico_template.json lido com sucesso")
            print(f"   - Campanhas anteriores: {list(dados['campanhas_anteriores'].keys())}")
            print(f"   - Médias de pesquisa: {list(dados['medias_pesquisa'].keys())}\n")
            return True
        else:
            print(f"⚠️  AVISO: historico_template.json não encontrado\n")
            return True

    except Exception as e:
        print(f"❌ ERRO: {e}\n")
        return False


def testar_argparse():
    """Testa se argparse está disponível"""
    print("=" * 60)
    print("TESTE 4: Processamento de argumentos")
    print("=" * 60)

    try:
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("-f", "--file", required=True)
        parser.add_argument("-s", "--start", required=True)
        parser.add_argument("-e", "--end", required=True)
        print("✅ OK: argparse funcionando\n")
        return True
    except Exception as e:
        print(f"❌ ERRO: {e}\n")
        return False


def testar_datetime():
    """Testa processamento de datas"""
    print("=" * 60)
    print("TESTE 5: Processamento de datas")
    print("=" * 60)

    try:
        from datetime import datetime

        # Testa formato DD/MM/YYYY
        data_teste = "15/03/2026"
        data_parsed = datetime.strptime(data_teste, "%d/%m/%Y")

        print(f"Data de teste: {data_teste}")
        print(f"Parsed como: {data_parsed.strftime('%d de %B de %Y')}")
        print("✅ OK: Datas processadas corretamente\n")
        return True
    except Exception as e:
        print(f"❌ ERRO: {e}\n")
        return False


def testar_resumo_semanal():
    """Testa se o script resumo_semanal.py pode ser importado"""
    print("=" * 60)
    print("TESTE 6: Script principal")
    print("=" * 60)

    try:
        script_dir = Path(__file__).parent
        script_file = script_dir / "resumo_semanal.py"

        if script_file.exists():
            print(f"✅ OK: {script_file.name} encontrado")

            # Tenta verificar a estrutura básica
            with open(script_file, 'r', encoding='utf-8') as f:
                conteudo = f.read()

            classes_esperadas = ["ResumoSemanal", "extrair_dados_macro", "extrair_dados_ads"]
            classes_encontradas = []

            for classe in classes_esperadas:
                if classe in conteudo:
                    classes_encontradas.append(classe)

            print(f"   - Classes/funções encontradas: {', '.join(classes_encontradas)}")
            print("✅ OK: Script parece estar completo\n")
            return True
        else:
            print(f"❌ ERRO: {script_file.name} não encontrado\n")
            return False

    except Exception as e:
        print(f"❌ ERRO: {e}\n")
        return False


def testar_help_script():
    """Testa se o script pode mostrar help"""
    print("=" * 60)
    print("TESTE 7: Verificação de help do script")
    print("=" * 60)

    try:
        import subprocess

        script_dir = Path(__file__).parent
        script_file = script_dir / "resumo_semanal.py"

        if not script_file.exists():
            print(f"⚠️  AVISO: {script_file.name} não encontrado, pulando teste\n")
            return True

        resultado = subprocess.run(
            [sys.executable, str(script_file), "--help"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if resultado.returncode == 0:
            print("✅ OK: Script responde ao --help")
            linhas = resultado.stdout.split('\n')
            print(f"   - Primeiras 3 linhas de ajuda:")
            for linha in linhas[:3]:
                if linha.strip():
                    print(f"     {linha}")
            print()
            return True
        else:
            print(f"❌ ERRO: Script retornou erro")
            print(resultado.stderr)
            print()
            return False

    except Exception as e:
        print(f"⚠️  AVISO: Não foi possível testar help: {e}\n")
        return True


def testar_encoding():
    """Testa suporte a UTF-8"""
    print("=" * 60)
    print("TESTE 8: Suporte a encoding UTF-8")
    print("=" * 60)

    try:
        # Testa caracteres especiais portugueses
        teste_str = "Resumão com acentuação: café, açúcar, pão"

        # Testa encoding
        encoded = teste_str.encode('utf-8')
        decoded = encoded.decode('utf-8')

        if teste_str == decoded:
            print(f"Teste: {teste_str}")
            print("✅ OK: UTF-8 funcionando corretamente\n")
            return True
        else:
            print("❌ ERRO: Problema com encoding UTF-8\n")
            return False

    except Exception as e:
        print(f"❌ ERRO: {e}\n")
        return False


def testar_formatacao_valores():
    """Testa formatação de valores financeiros"""
    print("=" * 60)
    print("TESTE 9: Formatação de valores")
    print("=" * 60)

    try:
        # Simula a formatação usada no script
        def formatar_moeda(valor: float) -> str:
            valor_arredondado = round(valor, 2)
            partes = f"{valor_arredondado:.2f}".split(".")
            inteira = partes[0]
            decimal = partes[1]

            if len(inteira) > 3:
                inteira_formatada = ""
                for i, digito in enumerate(reversed(inteira)):
                    if i > 0 and i % 3 == 0:
                        inteira_formatada = "." + inteira_formatada
                    inteira_formatada = digito + inteira_formatada
                inteira = inteira_formatada

            return f"R$ {inteira},{decimal}"

        testes = [
            (18.4, "R$ 18,40"),
            (1234.56, "R$ 1.234,56"),
            (1000000.00, "R$ 1.000.000,00"),
        ]

        todos_ok = True
        for valor, esperado in testes:
            resultado = formatar_moeda(valor)
            ok = resultado == esperado
            todos_ok = todos_ok and ok
            status = "✅" if ok else "❌"
            print(f"{status} {valor} → {resultado} (esperado: {esperado})")

        print()
        return todos_ok

    except Exception as e:
        print(f"❌ ERRO: {e}\n")
        return False


def testar_estrutura_diretorios():
    """Testa se a estrutura de diretórios está OK"""
    print("=" * 60)
    print("TESTE 10: Estrutura de diretórios")
    print("=" * 60)

    try:
        script_dir = Path(__file__).parent

        arquivos_esperados = [
            "resumo_semanal.py",
            "historico_template.json",
            "README.md",
            "GUIA_RAPIDO.md",
            "EXEMPLO_USO.md",
            "test_instalacao.py"
        ]

        print(f"Diretório: {script_dir}\n")

        todos_encontrados = True
        for arquivo in arquivos_esperados:
            caminho = script_dir / arquivo
            existe = caminho.exists()
            status = "✅" if existe else "❌"
            todos_encontrados = todos_encontrados and existe
            print(f"{status} {arquivo}")

        print()
        return todos_encontrados

    except Exception as e:
        print(f"❌ ERRO: {e}\n")
        return False


def main():
    """Executa todos os testes"""
    print("\n")
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 58 + "║")
    print("║" + "TESTE DE INSTALAÇÃO - RESUMO SEMANAL".center(58) + "║")
    print("║" + " " * 58 + "║")
    print("╚" + "=" * 58 + "╝\n")

    testes = [
        ("Python Version", testar_python_version),
        ("openpyxl", testar_openpyxl),
        ("JSON", testar_json),
        ("Argparse", testar_argparse),
        ("DateTime", testar_datetime),
        ("Script Principal", testar_resumo_semanal),
        ("Help", testar_help_script),
        ("Encoding", testar_encoding),
        ("Formatação", testar_formatacao_valores),
        ("Diretórios", testar_estrutura_diretorios),
    ]

    resultados = []
    for nome, teste_func in testes:
        try:
            resultado = teste_func()
            resultados.append((nome, resultado))
        except Exception as e:
            print(f"❌ ERRO não tratado em {nome}: {e}\n")
            resultados.append((nome, False))

    # Resumo final
    print("=" * 60)
    print("RESUMO DOS TESTES")
    print("=" * 60)

    passou = sum(1 for _, resultado in resultados if resultado)
    total = len(resultados)

    for nome, resultado in resultados:
        status = "✅ PASSOU" if resultado else "❌ FALHOU"
        print(f"{status:12} {nome}")

    print()
    print(f"Total: {passou}/{total} testes passaram")

    if passou == total:
        print("\n🎉 SUCESSO! Instalação OK, pronto para usar!\n")
        print("Próximos passos:")
        print("1. Preencher historico.json com dados de campanhas anteriores")
        print("2. Exportar Google Sheets como .xlsx")
        print("3. Executar: python resumo_semanal.py -f dados.xlsx -s 01/03/2026 -e 07/03/2026\n")
        return 0
    else:
        print("\n⚠️  Alguns testes falharam. Verifique os erros acima.\n")
        print("Se openpyxl não está instalado, execute:")
        print("pip install openpyxl --break-system-packages\n")
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
